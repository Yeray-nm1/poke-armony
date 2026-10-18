// Motor de armonía de equipo. Funciones PURAS sobre datos inyectados (sin I/O),
// de modo que cada métrica es testeable de forma aislada.
//
// NOTA de ids: Limitless usa ids con guion ("arcanine-hisui") mientras que el
// pokedex de Showdown usa ids sin guion ("arcaninehisui"). Normalizamos SIEMPRE
// las búsquedas de especie con `toId` para no perder formas regionales.
import { TYPES, effVs } from "./typechart"
import { natureEffect, SP_MAX, SP_TOTAL, spUsed, statAt50 } from "./stats"
import type { Meta, MoveData, MoveDex, Pokedex, SetStats, SpeciesData, Team, TeamSet } from "./types"

export type { Meta, SetStats } from "./types"

export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Busca una especie tolerando ids con/sin guion. */
export const speciesOf = (dex: Pokedex, id: string): SpeciesData | undefined => dex[toId(id)] ?? dex[id]

/**
 * Reparto del gauge. De los pesos salieron primero Aguante, Foco y Arquetipos
 * (como barras no distinguían equipos) y ahora la Velocidad: el gauge mezclaba
 * una métrica que no se ve en los números y no se deducía de ellos. Queda la
 * ofensiva —lo único que el gauge debe medir— con dos penalizaciones directas
 * (redundancia y peso de meta sin respaldo), así que el número se lee de las
 * tres barras: ofensiva alta ⇒ armonía alta, redundancia o respaldo ausente ⇒
 * la recortan.
 */
const REDUNDANCY_WEIGHT = 0.10
/** Penalización por el peso de meta que NO cierran 2+ piezas (cierre sin respaldo). */
const BACKUP_WEIGHT = 0.10
const TOP_N = 20

const attackingTypes = (set: TeamSet, moves: MoveDex): string[] =>
  (set.attacks ?? [])
    .map((m) => moves[toId(m)])
    .filter((m): m is MoveData => !!m && m.category !== "Status" && m.basePower > 0)
    .map((m) => m.type)

// ── 1. Equilibrio defensivo ──────────────────────────────────────────
export function defensiveBalance(team: Team, dex: Pokedex) {
  const breakdown: { type: string; weak: number; resist: number; net: number }[] = []
  let exposure = 0 // debilidades netas que nadie del equipo cubre
  let resistedTypes = 0
  for (const t of TYPES) {
    let weak = 0, resist = 0
    for (const s of team) {
      const dt = speciesOf(dex, s.id)?.types
      if (!dt) continue
      const m = effVs(t, dt)
      if (m > 1) weak++
      else if (m < 1) resist++
    }
    if (resist >= 1) resistedTypes++
    const net = Math.max(0, weak - resist)
    exposure += net
    breakdown.push({ type: t, weak, resist, net })
  }
  const resistCoverage = resistedTypes / TYPES.length
  const exposurePenalty = Math.min(1, exposure / 10)
  // Un equipo equilibrado resiste ampliamente; las debilidades apiladas pesan más.
  const score = clamp01(0.4 * resistCoverage + 0.6 * (1 - exposurePenalty))
  return { score, exposure, resistCoverage, breakdown }
}

// ── 2. Cobertura ofensiva (ponderada por el meta) ────────────────────
export function offensiveCoverage(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta) {
  const atk = new Set<string>()
  for (const s of team) for (const t of attackingTypes(s, moves)) atk.add(t)
  const top = meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id))
  const total = top.reduce((a, u) => a + u.pct, 0)
  const gaps: string[] = []
  let covered = 0
  for (const u of top) {
    const types = speciesOf(dex, u.id)!.types
    if ([...atk].some((t) => effVs(t, types) >= 2)) covered += u.pct
    else gaps.push(u.id)
  }
  return { score: total ? covered / total : 0, gaps, attackTypes: [...atk] }
}

// ── 3. Cierre de amenazas ────────────────────────────────────────────
export function commonAttackTypes(stats: SetStats | undefined, moves: MoveDex): string[] {
  if (!stats) return []
  const byType = new Map<string, number>()
  for (const mv of stats.moves.slice(0, 6)) {
    const m = moves[toId(mv.name)]
    if (m && m.category !== "Status" && m.basePower > 0) byType.set(m.type, (byType.get(m.type) ?? 0) + mv.pct)
  }
  return [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0])
}

export interface CriticalPiece {
  slot: number
  id: string
  name: string
  /** Amenazas del top que solo esta pieza cierra (mismo criterio que el cierre). */
  threats: string[]
  /** Peso de uso acumulado de esas amenazas (% del top considerado). */
  pct: number
}

/**
 * Punto único de fallo. De las amenazas del top, `backed` es el peso de uso de
 * las que cierran DOS o más piezas —si una cae, queda respaldo—; `pieces` lista,
 * por ranura, las que cierra una sola —si esa pieza no sale en team preview, esa
 * respuesta desaparece—. Las amenazas sin respuesta no cuentan aquí: ya las
 * nombra el titular «Sin respuesta a…».
 */
export interface Criticality {
  /** % de uso del top cuya respuesta tiene respaldo (2+ piezas). */
  backed: number
  /** Nº de amenazas del top con respaldo, sobre las consideradas. */
  backedCount: number
  total: number
  pieces: CriticalPiece[]
}

/**
 * Agrega la matriz «quién responde a quién» (ranuras por amenaza, mismo orden que
 * `top`) en el indicador de respaldo. Compartido por el cierre por tipos y el de
 * daño real, de modo que cliente y servidor derivan el dato del mismo cierre que
 * pueblan sus «Sin respuesta a…».
 */
export function criticalityOf(
  top: { id: string; pct: number }[],
  answerers: number[][],
  team: Team,
  dex: Pokedex,
): Criticality {
  const totalPct = top.reduce((a, u) => a + u.pct, 0)
  let backedPct = 0
  let backedCount = 0
  const singles = new Map<number, { threats: string[]; pct: number }>()
  top.forEach((u, i) => {
    const solvers = answerers[i] ?? []
    if (solvers.length >= 2) {
      backedPct += u.pct
      backedCount++
    } else if (solvers.length === 1) {
      const rec = singles.get(solvers[0]) ?? { threats: [], pct: 0 }
      rec.threats.push(u.id)
      rec.pct += u.pct
      singles.set(solvers[0], rec)
    }
  })
  const pieces = [...singles.entries()]
    .map(([slot, r]) => ({
      slot,
      id: team[slot]?.id ?? "",
      name: speciesOf(dex, team[slot]?.id ?? "")?.name ?? team[slot]?.id ?? "",
      threats: r.threats,
      pct: r.pct,
    }))
    .sort((a, b) => b.pct - a.pct)
  return { backed: totalPct ? backedPct / totalPct : 0, backedCount, total: top.length, pieces }
}

export function threatClosure(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta) {
  const top = meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id))
  const total = top.reduce((a, u) => a + u.pct, 0)
  const unanswered: string[] = []
  const answerers: number[][] = []
  let answered = 0
  for (const u of top) {
    const oppTypes = speciesOf(dex, u.id)!.types
    const fromOpp = commonAttackTypes(meta.byId[u.id], moves)
    const oppAtk = fromOpp.length ? fromOpp : oppTypes
    // "Fuerte" por tipos, calibrado contra el cierre con daño real: no es débil
    // a los ataques comunes de la amenaza (aguanta su golpeo) y le pega con
    // potencia — súper eficaz o un golpe de ≥60 de potencia. Exigirle además que
    // resista algo y que golpee SE hundía el respaldo (19% donde el daño real
    // daba 97%); el golpe neutro con potencia ya cuenta, como en el daño real.
    const solvers: number[] = []
    team.forEach((s, slot) => {
      const pTypes = speciesOf(dex, s.id)?.types
      if (!pTypes) return
      const noWeak = oppAtk.every((at) => effVs(at, pTypes) <= 1)
      const threatens = s.attacks.some((mvn) => {
        const m = moves[toId(mvn)]
        if (!m || m.category === "Status" || m.basePower <= 0) return false
        return effVs(m.type, oppTypes) >= 2 || m.basePower >= 60
      })
      if (noWeak && threatens) solvers.push(slot)
    })
    answerers.push(solvers)
    if (solvers.length) answered += u.pct
    else unanswered.push(u.id)
  }
  return {
    score: total ? answered / total : 0,
    unanswered,
    top: top.map((u) => u.id),
    criticality: criticalityOf(top, answerers, team, dex),
  }
}

export const SETUP_MOVES = [
  "Nasty Plot", "Swords Dance", "Calm Mind", "Dragon Dance", "Bulk Up", "Victory Dance",
  "Belly Drum", "Quiver Dance", "Shell Smash", "Tail Glow", "Take Heart", "Iron Defense",
]
export const REDIRECT_MOVES = ["Follow Me", "Rage Powder"]
export const SCREEN_MOVES = ["Reflect", "Light Screen", "Aurora Veil"]
export const GUARD_MOVES = ["Wide Guard", "Quick Guard", "Crafty Shield"]
export const OFFENSE_SUPPORT_MOVES = ["Helping Hand", "Coaching", "Decorate", "Howl", "Instruct", "After You"]

/** Cuatro climas, con lo que cada uno declara y lo que de él se aprovecha.
 *  Se comparten con el panel de Compatibilidad (`compatibility.ts`). */
export interface FieldKind {
  key: string
  label: string
  setAbilities: string[]
  setMoves: string[]
  abuserAbilities?: string[]
  abuserMoves?: string[]
  abuserItems?: string[]
}

export const WEATHERS: FieldKind[] = [
  { key: "sun", label: "sol", setAbilities: ["Drought"], setMoves: ["Sunny Day"],
    abuserAbilities: ["Chlorophyll", "Solar Power", "Leaf Guard", "Flower Gift", "Harvest"],
    abuserMoves: ["Solar Beam", "Solar Blade"] },
  { key: "rain", label: "lluvia", setAbilities: ["Drizzle"], setMoves: ["Rain Dance"],
    abuserAbilities: ["Swift Swim", "Hydration", "Rain Dish", "Dry Skin"],
    abuserMoves: ["Hurricane", "Thunder"] },
  { key: "sand", label: "arena", setAbilities: ["Sand Stream"], setMoves: ["Sandstorm"],
    abuserAbilities: ["Sand Rush", "Sand Force", "Sand Veil"] },
  { key: "snow", label: "nieve", setAbilities: ["Snow Warning"], setMoves: ["Snowscape"],
    abuserAbilities: ["Slush Rush", "Ice Body"], abuserMoves: ["Blizzard"] },
]

export const TERRAINS: FieldKind[] = [
  { key: "grassy", label: "hierba", setAbilities: ["Grassy Surge"], setMoves: ["Grassy Terrain"],
    abuserAbilities: ["Grassy Pelt"], abuserMoves: ["Grassy Glide"], abuserItems: ["Grassy Seeds"] },
  { key: "electric", label: "eléctrico", setAbilities: ["Electric Surge"], setMoves: ["Electric Terrain"],
    abuserAbilities: ["Surge Surfer"], abuserMoves: ["Rising Voltage"], abuserItems: ["Electric Seeds"] },
  { key: "psychic", label: "psíquico", setAbilities: ["Psychic Surge"], setMoves: ["Psychic Terrain"],
    abuserMoves: ["Expanding Force"], abuserItems: ["Psychic Seeds"] },
  { key: "misty", label: "niebla", setAbilities: ["Misty Surge"], setMoves: ["Misty Terrain"],
    abuserMoves: ["Misty Explosion"], abuserItems: ["Misty Seeds"] },
]
export const FIELD_ABUSER_MOVES = ["Terrain Pulse"]

// ── 4. Perfil de velocidad ───────────────────────────────────────────
/** Escenario de campo que altera la carrera de velocidad. */
export type Field = "none" | "tailwind" | "trickroom"

/** Campo del set que falta por configurar en una pieza. */
export type MissingField = "sp" | "item" | "nature"

const SCARF_MULT = 1.5
const isScarf = (item?: string) => !!item && toId(item) === "choicescarf"

/**
 * SP de velocidad inferidos para la oposición: Limitless no publica el reparto,
 * así que lo deducimos de su naturaleza más común — una naturaleza que sube
 * velocidad ⇒ inversión máxima; que la baja ⇒ ninguna — y, si es neutra
 * respecto a la velocidad, del propio stat base (≥ 90 ⇒ máxima).
 */
function inferSpeedSp(nature: string | undefined, base: number): number {
  const eff = natureEffect(nature)
  if (eff.plus === "spe") return SP_MAX
  if (eff.minus === "spe") return 0
  return base >= 90 ? SP_MAX : 0
}

/** Velocidad real a L50 de una pieza: SP, naturaleza y Choice Scarf (×1.5). */
function realSpeed(set: TeamSet, dex: Pokedex): number {
  const sp = speciesOf(dex, set.id)
  if (!sp) return 0
  const real = statAt50(sp.baseStats.spe, set.sp?.spe ?? 0, "spe", set.nature)
  return isScarf(set.item) ? Math.floor(real * SCARF_MULT) : real
}

/**
 * Velocidad de las amenazas del top-20, con su peso de uso. Limitless no
 * publica el reparto de SP, así que se infiere de la naturaleza más común
 * (ver `inferSpeedSp`); el objeto más usado puede añadir el Scarf.
 */
function threatSpeeds(dex: Pokedex, meta: Meta): { id: string; name: string; pct: number; speed: number }[] {
  return meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id)).map((u) => {
    const sp = speciesOf(dex, u.id)!
    const stats = meta.byId[u.id]
    const nature = stats?.natures[0]?.name
    const real = statAt50(sp.baseStats.spe, inferSpeedSp(nature, sp.baseStats.spe), "spe", nature)
    return {
      id: u.id,
      name: u.name,
      pct: u.pct,
      speed: isScarf(stats?.items[0]?.name) ? Math.floor(real * SCARF_MULT) : real,
    }
  })
}

/**
 * Perfil de velocidad. Para **cada amenaza** del top cuenta **cuántos de tus
 * miembros le ganan la carrera**; la métrica es la media de esas fracciones
 * ponderada por uso. Así no manda ningún extremo del equipo: un muro lento solo
 * resta 1/N y un soporte rápido no infla nada — antes, anclar en el más lento o
 * en el más rápido daba una falsa lectura («todo el equipo va lento» / «todo va
 * rápido») según cuál se eligiera.
 *
 * Sigue siendo solo velocidad (nada de tipos), así que no se solapa con Amenazas.
 *
 * - `none`: superas a la amenaza si tu velocidad la supera.
 * - `tailwind`: tus velocidades ×2.
 * - `trickroom`: se invierte el eje — bajo TR ganas a quien sea más rápido que
 *   tú (el lento actúa primero).
 *
 * Devuelve además los extremos del equipo (`fastest` / `slowest`) y, por amenaza
 * y escenario, `threats[i].beats[field]` (N de N) para el desglose de la UI.
 */
export function speedProfile(team: Team, dex: Pokedex, meta: Meta) {
  // Velocidad real a L50 con SP, naturaleza y objeto (Choice Scarf ×1.5).
  const teamSpeeds = team.map((s) => realSpeed(s, dex))
  const valid = teamSpeeds.filter((v) => v > 0)
  const n = valid.length
  const fastest = n ? Math.max(...valid) : 0
  const slowest = n ? Math.min(...valid) : 0

  const top = threatSpeeds(dex, meta)
  const total = top.reduce((a, u) => a + u.pct, 0) || 1
  // Por amenaza y escenario, cuántos de mis miembros la superan.
  const beatsFor = (field: Field, opp: number) =>
    valid.reduce((acc, v) => {
      if (field === "trickroom") return acc + (v < opp ? 1 : 0)
      const mine = field === "tailwind" ? v * 2 : v
      return acc + (mine > opp ? 1 : 0)
    }, 0)

  // Desglose por amenaza (para la UI): velocidad real y N de mis N que la superan.
  const threats = top.map((u) => ({
    id: u.id,
    name: u.name,
    pct: u.pct,
    speed: u.speed,
    beats: {
      none: beatsFor("none", u.speed),
      tailwind: beatsFor("tailwind", u.speed),
      trickroom: beatsFor("trickroom", u.speed),
    },
  }))

  // Métrica: media de esas fracciones (N de N), ponderada por el uso de la amenaza.
  const aggregate = (field: Field) =>
    threats.reduce((acc, t) => acc + (t.beats[field] / Math.max(1, n)) * t.pct, 0) / total

  const scenarios: Record<Field, number> = n
    ? {
        none: clamp01(aggregate("none")),
        tailwind: clamp01(aggregate("tailwind")),
        trickroom: clamp01(aggregate("trickroom")),
      }
    : { none: 0, tailwind: 0, trickroom: 0 }

  // Cobertura por pieza (para el desglose desplegable): % del meta que adelanta
  // cada miembro, ponderado por uso. `missing` lista lo que le falta al set (SP
  // sin repartir del todo, objeto o naturaleza), porque una velocidad baja puede
  // ser solo un set a medias.
  const coverageOf = (mSpeed: number, field: Field) =>
    threats.reduce((acc, t) => {
      const wins = field === "trickroom" ? mSpeed < t.speed : (field === "tailwind" ? mSpeed * 2 : mSpeed) > t.speed
      return acc + (wins ? t.pct : 0)
    }, 0) / total

  const members = team
    .map((s, i) => {
      const missing: MissingField[] = []
      if (spUsed(s) < SP_TOTAL) missing.push("sp")
      if (!s.item) missing.push("item")
      if (!s.nature) missing.push("nature")
      return {
        id: s.id,
        name: speciesOf(dex, s.id)?.name ?? s.name ?? s.id,
        speed: teamSpeeds[i],
        missing,
      }
    })
    .filter((m) => m.speed > 0)
    .sort((a, b) => b.speed - a.speed)
    .map((m) => ({
      ...m,
      coverage: {
        none: coverageOf(m.speed, "none"),
        tailwind: coverageOf(m.speed, "tailwind"),
        trickroom: coverageOf(m.speed, "trickroom"),
      } as Record<Field, number>,
    }))

  const hasTailwind = team.some((s) => (s.attacks ?? []).includes("Tailwind"))
  const hasTrickRoom = team.some((s) => (s.attacks ?? []).includes("Trick Room"))

  return {
    scenarios, fastest, slowest, teamSize: n,
    teamSpeeds, hasTailwind, hasTrickRoom, threats, members,
  }
}

// ── 5. (Sinergia) ────────────────────────────────────────────────────
// El detalle de qué piezas se ayudan o se estorban ya no es una métrica: vive
// en el panel de Compatibilidad (`compatibility.ts`), por parejas y explicado.

// ── 6. Redundancia (penaliza) ────────────────────────────────────────
export function redundancy(team: Team, dex: Pokedex) {
  const items = team.map((s) => s.item).filter(Boolean) as string[]
  const dupItems = items.length - new Set(items).size
  const primaries = team.map((s) => speciesOf(dex, s.id)?.types?.[0]).filter(Boolean) as string[]
  const dupTypes = primaries.length - new Set(primaries).size
  const n = Math.max(1, team.length - 1)
  return clamp01(0.6 * dupItems / n + 0.4 * dupTypes / n)
}

// ── Compuesto ────────────────────────────────────────────────────────
export interface TypeCoverage {
  type: string
  /** N.º de miembros del equipo a los que este tipo les pega súper efectivo. */
  weak: number
  /** N.º de miembros del equipo que resisten este tipo. */
  resist: number
}

export interface Analysis {
  harmony: number
  /**
   * Las tres barras = los tres términos del gauge. `backup` (peso del meta
   * respaldado por 2+ piezas) es SIEMPRE por tipos, también en el servidor: el
   * gauge no parpadea al llegar el daño real; ese detalle se muestra aparte
   * («Punto único de fallo») con `criticality`, que sí se refina con daño real.
   */
  metrics: { offense: number; redundancy: number; backup: number }
  /** Velocidad por escenario de campo (no entra en `metrics`: el gauge la ignora). */
  speedScenarios: Record<Field, number>
  /** Punto único de fallo: qué amenazas dependen de UNA sola pieza (informativo). */
  criticality: Criticality
  unanswered: string[]
  offenseGaps: string[]
  nakedTypes: string[]
  /** Estado de los 18 tipos: defensiva (resistido / débil apilado) y ofensiva (golpeado SE). */
  typeCoverage: TypeCoverage[]
}

/**
 * Cierre de amenazas inyectable. Por defecto es por tipos (rápido, apto para el
 * cliente); en el servidor se sustituye por uno calculado con daño real
 * (`@smogon/calc`), sin que la librería entre en el bundle del navegador.
 */
export type ClosureFn = (team: Team) => { score: number; unanswered: string[]; criticality: Criticality }

export interface AnalyzeOptions {
  closure?: ClosureFn
}

/**
 * Armonía compuesta a partir de las métricas (fuente única para cliente y
 * servidor): ofensiva, salvo la redundancia y el peso de meta sin respaldo.
 */
export function harmonyFromMetrics(metrics: Analysis["metrics"]): number {
  return +(100 * clamp01(
    metrics.offense - REDUNDANCY_WEIGHT * metrics.redundancy - BACKUP_WEIGHT * (1 - metrics.backup),
  )).toFixed(1)
}

export function analyze(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta, opts: AnalyzeOptions = {}): Analysis {
  const d = defensiveBalance(team, dex)
  const o = offensiveCoverage(team, dex, moves, meta)
  const t = opts.closure ? opts.closure(team) : threatClosure(team, dex, moves, meta)
  const sp = speedProfile(team, dex, meta)
  const red = redundancy(team, dex)

  const metrics = { offense: o.score, redundancy: red, backup: t.criticality.backed }
  const harmony = harmonyFromMetrics(metrics)

  const typeCoverage: TypeCoverage[] = d.breakdown.map((b) => ({
    type: b.type,
    weak: b.weak,
    resist: b.resist,
  }))

  return {
    harmony: +harmony.toFixed(1), metrics, speedScenarios: sp.scenarios,
    criticality: t.criticality,
    unanswered: t.unanswered,
    offenseGaps: o.gaps, nakedTypes: d.breakdown.filter((b) => b.weak >= 2 && b.resist === 0).map((b) => b.type),
    typeCoverage,
  }
}
