// Motor de armonía de equipo. Funciones PURAS sobre datos inyectados (sin I/O),
// de modo que cada métrica es testeable de forma aislada.
//
// NOTA de ids: Limitless usa ids con guion ("arcanine-hisui") mientras que el
// pokedex de Showdown usa ids sin guion ("arcaninehisui"). Normalizamos SIEMPRE
// las búsquedas de especie con `toId` para no perder formas regionales.
import { TYPES, effVs } from "./typechart"
import { natureEffect, SP_MAX, statAt50 } from "./stats"
import type { Meta, MoveData, MoveDex, Pokedex, SetStats, SpeciesData, Team, TeamSet } from "./types"

export type { Meta, SetStats } from "./types"

export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Busca una especie tolerando ids con/sin guion. */
export const speciesOf = (dex: Pokedex, id: string): SpeciesData | undefined => dex[toId(id)] ?? dex[id]

const WEIGHTS = { defense: 0.20, offense: 0.15, threatClosure: 0.30, roles: 0.15, speed: 0.10, synergy: 0.10 }
const REDUNDANCY_WEIGHT = 0.10
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

export function threatClosure(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta) {
  const top = meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id))
  const total = top.reduce((a, u) => a + u.pct, 0)
  const unanswered: string[] = []
  let answered = 0
  for (const u of top) {
    const oppTypes = speciesOf(dex, u.id)!.types
    const fromOpp = commonAttackTypes(meta.byId[u.id], moves)
    const oppAtk = fromOpp.length ? fromOpp : oppTypes
    // "Fuerte" real: resiste los ataques principales de la amenaza, no es débil
    // a ninguno, y la golpea de forma súper efectiva. El golpe neutro no cuenta.
    const hasAnswer = team.some((s) => {
      const pTypes = speciesOf(dex, s.id)?.types
      if (!pTypes) return false
      const noWeak = oppAtk.every((at) => effVs(at, pTypes) <= 1)
      const resists = oppAtk.some((at) => effVs(at, pTypes) < 1)
      const threatens = s.attacks.some((mvn) => {
        const m = moves[toId(mvn)]
        return !!m && m.category !== "Status" && m.basePower > 0 && effVs(m.type, oppTypes) >= 2
      })
      return noWeak && resists && threatens
    })
    if (hasAnswer) answered += u.pct
    else unanswered.push(u.id)
  }
  return { score: total ? answered / total : 0, unanswered, top: top.map((u) => u.id) }
}

// ── 4. Cobertura de roles ────────────────────────────────────────────
// El control de velocidad (Tailwind/Icy Wind/Trick Room…) NO puntúa aquí: lo
// representa el escenario de campo en la métrica de Velocidad. Aquí solo se
// reporta como información (`speedControl`) para no contarlo dos veces.
const ROLES: Record<string, string[]> = {
  redirection: ["Follow Me", "Rage Powder"],
  protect: ["Protect", "Detect"],
  "fake-out": ["Fake Out"],
  "win-condition": ["Nasty Plot", "Swords Dance", "Calm Mind", "Dragon Dance", "Bulk Up", "Victory Dance"],
  "hazard-control": ["Rapid Spin", "Defog", "Mortal Spin", "Court Change"],
}
const SPEED_CONTROL = ["Tailwind", "Icy Wind", "Thunder Wave", "Trick Room", "Electroweb", "Bulldoze"]
const ALL_ROLES = [...Object.keys(ROLES), "intimidate"]

export function roleCoverage(team: Team) {
  const present = new Set<string>()
  let speedControl = false
  for (const s of team) {
    const mv = new Set(s.attacks ?? [])
    for (const [role, list] of Object.entries(ROLES)) if (list.some((m) => mv.has(m))) present.add(role)
    if (s.ability === "Intimidate") present.add("intimidate")
    if (SPEED_CONTROL.some((m) => mv.has(m))) speedControl = true
  }
  return {
    score: present.size / ALL_ROLES.length,
    present: [...present],
    missing: ALL_ROLES.filter((r) => !present.has(r)),
    speedControl,
  }
}

// ── 5. Perfil de velocidad ───────────────────────────────────────────
/** Escenario de campo que altera la carrera de velocidad. */
export type Field = "none" | "tailwind" | "trickroom"

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

/**
 * Perfil de velocidad. Devuelve la puntuación de la carrera frente al meta en
 * los **tres escenarios de campo** (sin control / Tailwind / Trick Room) para
 * que la UI pueda alternarlos sin recalcular nada.
 *
 * - `none`: ganas a las amenazas más lentas que tu miembro más rápido.
 * - `tailwind`: tus velocidades ×2.
 * - `trickroom`: se invierte el eje — bajo TR ganas a quien sea más rápido que
 *   tu miembro más lento (el lento actúa primero).
 */
export function speedProfile(team: Team, dex: Pokedex, meta: Meta) {
  // Velocidad real a L50 con SP, naturaleza y objeto (Choice Scarf ×1.5).
  const teamSpeeds = team.map((s) => {
    const sp = speciesOf(dex, s.id)
    if (!sp) return 0
    const real = statAt50(sp.baseStats.spe, s.sp?.spe ?? 0, "spe", s.nature)
    return isScarf(s.item) ? Math.floor(real * SCARF_MULT) : real
  })
  const valid = teamSpeeds.filter((v) => v > 0)
  const fastest = valid.length ? Math.max(...valid) : 0
  const slowest = valid.length ? Math.min(...valid) : 0

  const top = meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id))
  const total = top.reduce((a, u) => a + u.pct, 0) || 1
  const speeds = top.map((u) => {
    const sp = speciesOf(dex, u.id)!
    const stats = meta.byId[u.id]
    const nature = stats?.natures[0]?.name
    const real = statAt50(sp.baseStats.spe, inferSpeedSp(nature, sp.baseStats.spe), "spe", nature)
    return isScarf(stats?.items[0]?.name) ? Math.floor(real * SCARF_MULT) : real
  })
  const credit = (wins: (oppSpeed: number) => boolean) =>
    top.reduce((acc, u, i) => (wins(speeds[i]) ? acc + u.pct : acc), 0) / total

  const scenarios: Record<Field, number> = valid.length
    ? {
        none: clamp01(credit((o) => o < fastest)),
        tailwind: clamp01(credit((o) => o < fastest * 2)),
        trickroom: clamp01(credit((o) => o > slowest)),
      }
    : { none: 0, tailwind: 0, trickroom: 0 }

  const hasTailwind = team.some((s) => (s.attacks ?? []).includes("Tailwind"))
  const hasTrickRoom = team.some((s) => (s.attacks ?? []).includes("Trick Room"))

  return { scenarios, fastest, slowest, teamSpeeds, hasTailwind, hasTrickRoom }
}

// ── 6. Sinergia ──────────────────────────────────────────────────────
export function synergy(team: Team) {
  const abilities = new Set(team.map((s) => s.ability))
  const allMoves = new Set(team.flatMap((s) => s.attacks ?? []))
  const has = (list: string[]) => list.some((m) => allMoves.has(m))
  const setup = has(ROLES["win-condition"])
  let hits = 0
  if ((abilities.has("Grassy Surge") && allMoves.has("Grassy Glide")) ||
      (abilities.has("Electric Surge") && allMoves.has("Rising Voltage")) ||
      (abilities.has("Drizzle") && has(["Surf", "Muddy Water", "Hydro Pump", "Water Spout", "Wave Crash", "Liquidation", "Scald"])) ||
      (abilities.has("Drought") && has(["Heat Wave", "Flamethrower", "Fire Blast", "Flare Blitz", "Solar Beam"]))) hits++
  if (allMoves.has("Fake Out") && setup) hits++
  if (has(ROLES.redirection) && setup) hits++
  return { score: hits / 3, hits }
}

// ── 7. Redundancia (penaliza) ────────────────────────────────────────
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
  metrics: { defense: number; offense: number; threatClosure: number; roles: number; speed: number; synergy: number; redundancy: number }
  /** Velocidad por escenario de campo (`metrics.speed` = `speedScenarios.none`). */
  speedScenarios: Record<Field, number>
  weakest: string[]
  unanswered: string[]
  missingRoles: string[]
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
export type ClosureFn = (team: Team) => { score: number; unanswered: string[] }

export interface AnalyzeOptions {
  closure?: ClosureFn
}

/** Armonía compuesta a partir de las métricas (fuente única para cliente y servidor). */
export function harmonyFromMetrics(metrics: Analysis["metrics"]): number {
  const base = WEIGHTS.defense * metrics.defense + WEIGHTS.offense * metrics.offense +
    WEIGHTS.threatClosure * metrics.threatClosure + WEIGHTS.roles * metrics.roles +
    WEIGHTS.speed * metrics.speed + WEIGHTS.synergy * metrics.synergy
  return +(100 * clamp01(base - REDUNDANCY_WEIGHT * metrics.redundancy)).toFixed(1)
}

/** Las 3 métricas más bajas (excluye `redundancy`), para el titular de puntos débiles. */
export function weakestMetrics(metrics: Analysis["metrics"]): string[] {
  return (Object.entries(metrics) as [string, number][])
    .filter(([k]) => k !== "redundancy")
    .sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => k)
}

export function analyze(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta, opts: AnalyzeOptions = {}): Analysis {
  const d = defensiveBalance(team, dex)
  const o = offensiveCoverage(team, dex, moves, meta)
  const t = opts.closure ? opts.closure(team) : threatClosure(team, dex, moves, meta)
  const r = roleCoverage(team)
  const sp = speedProfile(team, dex, meta)
  const sy = synergy(team)
  const red = redundancy(team, dex)

  const metrics = {
    defense: d.score, offense: o.score, threatClosure: t.score,
    roles: r.score, speed: sp.scenarios.none, synergy: sy.score, redundancy: red,
  }
  const harmony = harmonyFromMetrics(metrics)

  const weakest = weakestMetrics(metrics)

  const typeCoverage: TypeCoverage[] = d.breakdown.map((b) => ({
    type: b.type,
    weak: b.weak,
    resist: b.resist,
  }))

  return {
    harmony: +harmony.toFixed(1), metrics, speedScenarios: sp.scenarios, weakest,
    unanswered: t.unanswered, missingRoles: r.missing,
    offenseGaps: o.gaps, nakedTypes: d.breakdown.filter((b) => b.weak >= 2 && b.resist === 0).map((b) => b.type),
    typeCoverage,
  }
}
