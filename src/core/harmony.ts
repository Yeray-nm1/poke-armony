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
 * ofensiva —lo único que el gauge debe medir— con la redundancia como
 * penalización directa, así que el número se lee de las barras: cobertura
 * ofensiva alta ⇒ armonía alta, redundancia alta ⇒ la recorta.
 */
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

// ── 4. Roles: el foco del equipo ─────────────────────────────────────
//
// Un **rol** es la función de una pieza (clima, apoyo, seteo…), no el
// movimiento concreto que la hace. Y —a diferencia de la lista anterior— la
// métrica **no exige una colección de roles**: que falte uno no resta, porque
// puede no seguir la dirección del equipo (un equipo rápido no pierde puntos
// por no llevar Trick Room, ni uno lento por no llevar Tailwind).
//
// Lo que mide es si el **foco que declara el propio equipo** está sostenido.
// Detectamos sus planes —Trick Room, ritmo rápido, clima, terreno, seteo, y
// `balance` cuando no declara ninguno— y por cada uno comprobamos que tenga
// beneficiarios, que no lo contradigan y que alguien lo ayude a montarlo. Nada
// que el equipo no declara le resta puntos; un equipo nuevo que encaje en un
// molde conocido cae en `balance` y solo se le pide coherencia.
//
// El control de velocidad sigue fuera de la nota (la carrera se mide en la
// métrica de Velocidad): aquí solo se etiqueta, para no contarlo dos veces.

/** Función que cumple una pieza dentro del equipo. */
export type PieceRole =
  | "weather" | "terrain" | "screens" | "speedControl" | "redirect"
  | "guards" | "fakeOut" | "offenseSupport" | "spread" | "statDrop"
  | "heal" | "pivot" | "setup"

export const PIECE_ROLE_LABEL: Record<PieceRole, string> = {
  weather: "clima",
  terrain: "terreno",
  screens: "pantallas",
  speedControl: "control de velocidad",
  redirect: "redirección",
  guards: "guardias",
  fakeOut: "presión inicial",
  offenseSupport: "apoyo ofensivo",
  spread: "multi-objetivo",
  statDrop: "baja stats",
  heal: "curación",
  pivot: "pivote",
  setup: "seteo",
}

/** Plan que declara un equipo. `balance` es el de quien no declara ninguno. */
export type PlanId = "trickroom" | "tailwind" | "weather" | "terrain" | "setup" | "balance"

/** Una expectativa del plan y si se cumple. */
export interface PlanCheck {
  label: string
  ok: boolean
}

export interface RolePlan {
  id: PlanId
  label: string
  checks: PlanCheck[]
}

export interface RoleReport {
  /** 0..1: proporción de comprobaciones cumplidas por los planes declarados. */
  score: number
  plans: RolePlan[]
  /** Funciones detectadas en cada pieza (para el detalle de la UI). */
  pieces: { id: string; name: string; roles: PieceRole[] }[]
  /** Hay control de velocidad en el equipo (informativo: puntúa en Velocidad). */
  speedControl: boolean
}

export const SETUP_MOVES = [
  "Nasty Plot", "Swords Dance", "Calm Mind", "Dragon Dance", "Bulk Up", "Victory Dance",
  "Belly Drum", "Quiver Dance", "Shell Smash", "Tail Glow", "Take Heart", "Iron Defense",
]
export const REDIRECT_MOVES = ["Follow Me", "Rage Powder"]
export const REDIRECT_ABILITIES = ["Storm Drain", "Lightning Rod"]
export const SCREEN_MOVES = ["Reflect", "Light Screen", "Aurora Veil"]
export const GUARD_MOVES = ["Wide Guard", "Quick Guard", "Crafty Shield"]
export const OFFENSE_SUPPORT_MOVES = ["Helping Hand", "Coaching", "Decorate", "Howl", "Instruct", "After You"]
const STAT_DROP_MOVES = [
  "Icy Wind", "Snarl", "Will-O-Wisp", "Parting Shot", "Charm", "Fake Tears",
  "Screech", "Metal Sound", "Baby-Doll Eyes", "Tearful Look", "Feather Dance", "Scary Face",
]
const HEAL_MOVES = [
  "Recover", "Roost", "Slack Off", "Soft-Boiled", "Synthesis", "Shore Up", "Milk Drink",
  "Strength Sap", "Life Dew", "Heal Pulse", "Wish", "Jungle Healing", "Lunar Blessing",
  "Morning Sun", "Moonlight", "Rest", "Pollen Puff",
]
const PIVOT_MOVES = ["U-turn", "Volt Switch", "Flip Turn", "Parting Shot", "Teleport", "Baton Pass", "Shed Tail"]
/** Prioridad sin Fake Out (que ya es su propio rol): sirve para cerrar KO. */
const PRIORITY_MOVES = [
  "Sucker Punch", "Extreme Speed", "Grassy Glide", "Aqua Jet", "Bullet Punch", "Ice Shard",
  "Shadow Sneak", "Mach Punch", "Vacuum Wave", "Accelerock", "First Impression",
  "Water Shuriken", "Jet Punch", "Upper Hand", "Quick Attack",
]
/** Piezas que aguantan siendo objetivo: objeto de aguante o stats defensivas. */
const SURVIVAL_ITEMS = [
  "Focus Sash", "Leftovers", "Sitrus Berry", "Lum Berry", "Chesto Berry", "Wiki Berry",
  "Mago Berry", "Iapapa Berry", "Aguav Berry", "Liechi Berry", "Petaya Berry", "Salac Berry",
  "Custap Berry", "Rawst Berry", "Aspear Berry", "Rocky Helmet",
]
/** Aguante mínimo (def + spd base) para cargar un seteo. */
const SETUP_BULK = 170

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
/** Control de velocidad: NO puntúa en Roles (la carrera es de Velocidad), solo etiqueta. */
const SPEED_CONTROL = ["Tailwind", "Icy Wind", "Thunder Wave", "Trick Room", "Electroweb", "Bulldoze"]

/** Roles que suman como apoyo genérico (para `balance`). */
const SUPPORT_ROLES: PieceRole[] = ["redirect", "guards", "screens", "fakeOut", "statDrop", "heal", "offenseSupport"]
/** Roles que habilitan un turno (montar TR/Tailwind o cargar un seteo). */
const ENABLE_ROLES: PieceRole[] = ["redirect", "guards", "screens", "fakeOut"]
const SETUP_SUPPORT_ROLES: PieceRole[] = [...ENABLE_ROLES, "statDrop"]

/** Funciones de una pieza, deducidas de sus movimientos, habilidad y objeto. */
export function pieceRoles(set: TeamSet, moveDex: MoveDex): PieceRole[] {
  const atk = new Set(set.attacks ?? [])
  const has = (list: string[]) => list.some((m) => atk.has(m))
  const isSpread = (name: string) => {
    const m = moveDex[toId(name)]
    return !!m && m.category !== "Status" && m.basePower > 0 &&
      (m.target === "allAdjacentFoes" || m.target === "allAdjacent" || m.target === "all")
  }
  const setsField = (k: FieldKind) => k.setAbilities.includes(set.ability ?? "") || has(k.setMoves)
  const roles = new Set<PieceRole>()
  if (WEATHERS.some(setsField)) roles.add("weather")
  if (TERRAINS.some(setsField)) roles.add("terrain")
  if (has(SCREEN_MOVES)) roles.add("screens")
  if (has(SPEED_CONTROL)) roles.add("speedControl")
  if (has(REDIRECT_MOVES) || REDIRECT_ABILITIES.includes(set.ability ?? "")) roles.add("redirect")
  if (has(GUARD_MOVES)) roles.add("guards")
  if (atk.has("Fake Out")) roles.add("fakeOut")
  if (has(OFFENSE_SUPPORT_MOVES)) roles.add("offenseSupport")
  if ([...atk].some(isSpread)) roles.add("spread")
  if (has(STAT_DROP_MOVES) || set.ability === "Intimidate") roles.add("statDrop")
  if (has(HEAL_MOVES) || set.ability === "Regenerator") roles.add("heal")
  if (has(PIVOT_MOVES)) roles.add("pivot")
  if (has(SETUP_MOVES)) roles.add("setup")
  return [...roles]
}

/**
 * Foco del equipo: detecta el plan que declara y comprueba que lo sostiene.
 * La nota es la media de comprobaciones cumplidas de los planes declarados;
 * `balance` entra solo si no hay ningún otro (nunca se exige un plan que el
 * equipo no ha elegido).
 */
export function roleFocus(team: Team, dex: Pokedex, moveDex: MoveDex, meta: Meta): RoleReport {
  const rolesByPiece = team.map((s) => pieceRoles(s, moveDex))
  const attacks = team.map((s) => new Set(s.attacks ?? []))
  const speeds = team.map((s) => realSpeed(s, dex))
  const opp = threatSpeeds(dex, meta)
  const pctTotal = opp.reduce((a, o) => a + o.pct, 0) || 1

  /** % de amenazas que adelanta un miembro bajo un escenario dado. */
  const cover = (mine: number, under: "none" | "tailwind" | "trickroom") =>
    opp.reduce((a, o) => {
      const wins = under === "trickroom" ? mine < o.speed : (under === "tailwind" ? mine * 2 : mine) > o.speed
      return a + (wins ? o.pct : 0)
    }, 0) / pctTotal

  const count = (pred: (i: number) => boolean) =>
    team.reduce((n, _, i) => n + (pred(i) ? 1 : 0), 0)
  const hasRole = (i: number, roles: PieceRole[]) => roles.some((r) => rolesByPiece[i].includes(r))
  const withRoles = (roles: PieceRole[]) => count((i) => hasRole(i, roles))
  const declaresField = (k: FieldKind) => (i: number) =>
    k.setAbilities.includes(team[i].ability ?? "") || [...attacks[i]].some((m) => k.setMoves.includes(m))
  const plan = (id: PlanId, label: string, checks: PlanCheck[]): RolePlan => ({ id, label, checks })

  const plans: RolePlan[] = []
  /** Añade solo los planes que el equipo sí declara. */
  const declarePlans = (ps: (RolePlan | null)[]) => {
    for (const p of ps) if (p) plans.push(p)
  }

  // Planes de velocidad de campo: piden beneficiarios y que alguien los monte.
  const speedPlan = (id: "trickroom" | "tailwind"): RolePlan | null => {
    const move = id === "trickroom" ? "Trick Room" : "Tailwind"
    if (!attacks.some((a) => a.has(move))) return null
    const fast = count((i) => cover(speeds[i], "none") >= 0.6)
    const enables = withRoles(ENABLE_ROLES)
    if (id === "trickroom") {
      // Bajo TR actúa antes quien es más lento que la amenaza: los lentos ganan.
      const beneficiaries = count((i) => cover(speeds[i], "trickroom") >= 0.6)
      return plan(id, "Trick Room", [
        { label: "Al menos 2 piezas lentas que aprovechen el TR", ok: beneficiaries >= 2 },
        { label: "Sin piezas rápidas que se queden atrás", ok: fast <= 1 },
        { label: "Alguien que ayude a montarlo", ok: enables >= 1 },
      ])
    }
    // Los beneficiarios se miden CON el alivio: un equipo de ritmo rápido es
    // exactamente el que no llega por sí solo y por eso lo monta.
    const beneficiaries = count((i) => cover(speeds[i], "tailwind") >= 0.6)
    const stranded = count((i) => cover(speeds[i], "tailwind") <= 0.5)
    return plan(id, "Ritmo rápido (Tailwind)", [
      { label: "Al menos 2 piezas que alcancen la meta con el alivio", ok: beneficiaries >= 2 },
      { label: "Sin piezas que ni con Tailwind lleguen", ok: stranded <= 1 },
      { label: "Alguien que ayude a conservarlo", ok: enables >= 1 },
    ])
  }
  declarePlans([speedPlan("trickroom"), speedPlan("tailwind")])

  // Campo (clima/terreno): piden que alguien lo aproveche y no chocar con otro.
  const fieldPlans = (kinds: FieldKind[], id: PlanId, noun: string): (RolePlan | null)[] =>
    kinds.map((k) => {
      const declares = declaresField(k)
      if (!team.some((_, i) => declares(i))) return null
      const abusers = count((i) =>
        (k.abuserAbilities ?? []).includes(team[i].ability ?? "") ||
        (k.abuserItems ?? []).includes(team[i].item ?? "") ||
        [...attacks[i]].some((m) => (k.abuserMoves ?? []).includes(m) || FIELD_ABUSER_MOVES.includes(m)),
      )
      const conflicting = count((i) =>
        kinds.some((o) => o.key !== k.key && declaresField(o)(i)),
      )
      return plan(id, `${noun}: ${k.label}`, [
        { label: `Al menos una pieza que aproveche el ${noun.toLowerCase()}`, ok: abusers >= 1 },
        { label: `Sin otro ${noun.toLowerCase()} que lo contradiga`, ok: conflicting === 0 },
      ])
    })
  declarePlans([...fieldPlans(WEATHERS, "weather", "Clima"), ...fieldPlans(TERRAINS, "terrain", "Terreno")])

  // Seteo: pide a alguien que lo habilite y que el seteador aguante.
  const setups = count((i) => rolesByPiece[i].includes("setup"))
  if (setups >= 2) {
    const hardy = team.some((_, i) => {
      if (!rolesByPiece[i].includes("setup")) return false
      const sp = speciesOf(dex, team[i].id)
      const bulk = sp ? sp.baseStats.def + sp.baseStats.spd >= SETUP_BULK : false
      return bulk || (team[i].item ? SURVIVAL_ITEMS.includes(team[i].item) : false)
    })
    plans.push(plan("setup", "Seteo / win-condition", [
      { label: "Alguien que habilite el seteo", ok: withRoles(SETUP_SUPPORT_ROLES) >= 1 },
      { label: "Los seteadores no están a la intemperie", ok: hardy },
    ]))
  }

  // Sin foco declarado: el equipo juega a buen equipo ("balance") y lo único
  // que se le pide es que haya apoyo con qué trabajar y con qué cerrar.
  if (!plans.length) {
    const closers = count((i) =>
      rolesByPiece[i].includes("setup") ||
      [...attacks[i]].some((m) => PRIORITY_MOVES.includes(m)),
    )
    plans.push(plan("balance", "Equipo sin plan fijo", [
      { label: "Al menos 2 piezas de apoyo", ok: withRoles(SUPPORT_ROLES) >= 2 },
      { label: "Alguien que cierre las partidas", ok: closers >= 1 },
    ]))
  }

  const kept = plans
  const totalChecks = kept.reduce((a, p) => a + p.checks.length, 0)
  const passed = kept.reduce((a, p) => a + p.checks.filter((c) => c.ok).length, 0)

  return {
    score: totalChecks ? passed / totalChecks : 0,
    plans: kept,
    pieces: team.map((s, i) => ({
      id: s.id,
      name: speciesOf(dex, s.id)?.name ?? s.name ?? s.id,
      roles: rolesByPiece[i],
    })),
    speedControl: attacks.some((a) => SPEED_CONTROL.some((m) => a.has(m))),
  }
}

// ── 5. Perfil de velocidad ───────────────────────────────────────────
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

// ── 6. (Sinergia) ────────────────────────────────────────────────────
// El detalle de qué piezas se ayudan o se estorban ya no es una métrica: vive
// en el panel de Compatibilidad (`compatibility.ts`), por parejas y explicado.

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
  metrics: { offense: number; redundancy: number }
  /** Velocidad por escenario de campo (no entra en `metrics`: el gauge la ignora). */
  speedScenarios: Record<Field, number>
  unanswered: string[]
  /** Foco de roles: plan declarado y funciones de cada pieza (no puntúa en la armonía). */
  roleFocus: RoleReport
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

// ── 7. Cobertura de arquetipos ──────────────────────────────────────
//
// Mide **respuestas a estrategias de equipo**, no a Pokémon sueltos: lo
// individual ya lo cubren la ofensiva, el aguante y la lista «Sin respuesta a…».
// Para cada arquetipo (Trick Room, ritmo rápido, clima, seteo rival) se
// comprueba si alguien puede **negar** lo que ese plan busca, y la nota es la
// media de comprobaciones cumplidas **ponderada por cuánto del meta lo juega**.
// Si el meta no lo juega, no puntúa — igual que «Foco del equipo» no exige un
// plan que el propio equipo no ha declarado.
//
// Todo sale de datos de set (movimientos, habilidad, uso): no hay listas de
// equipos ni de arquetipos importadas de fuera. El tipo que manda en el clima
// (Agua con lluvia, Fuego con sol…) es una tabla pequeña y justificada.

/** Tipo que lidera cada clima: el que hay que resistir para no dejarse llevar. */
const WEATHER_LEAD_TYPE: Record<string, string> = { rain: "Water", sun: "Fire", sand: "Ground", snow: "Ice" }
/** Piezas que frenan un seteo rival: niegan el boost o castigan a su autor. */
const ANTI_SETUP_MOVES = ["Haze", "Clear Smog", "Taunt", "Encore", "Roar", "Whirlwind", "Dragon Tail", "Foul Play"]
const ANTI_SETUP_ABILITIES = ["Unaware"]
/** Aguante mínimo (def + spd base) para ser el muro que aguanta el barrido. */
const WALL_BULK = SETUP_BULK

/** Plan ajeno que se intenta negar. */
export type ArchetypeId = "trickroom" | "tailwind" | "weather" | "setup"

export interface ArchetypeCheck {
  label: string
  ok: boolean
}

export interface ArchetypeReport {
  id: ArchetypeId
  /** Etiqueta (p. ej. «Clima: lluvia», según el clima que más juega el meta). */
  label: string
  /** % de uso del meta que declara el arquetipo: su peso dentro de la nota. */
  prevalence: number
  checks: ArchetypeCheck[]
}

export interface ArchetypeCoverageReport {
  /** 0..1: comprobaciones cumplidas, ponderadas por cuánto del meta juega cada plan. */
  score: number
  archetypes: ArchetypeReport[]
}

export function archetypeCoverage(team: Team, dex: Pokedex, meta: Meta): ArchetypeCoverageReport {
  const top = meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id))
  const attacks = team.map((s) => new Set(s.attacks ?? []))
  const abilities = team.map((s) => s.ability ?? "")
  const hasMove = (i: number, name: string) => attacks[i].has(name)
  const someHas = (list: string[]) => team.some((_, i) => list.some((m) => hasMove(i, m)))

  // ── Prevalencia: qué planes declara el meta.
  // Peso = uso del Pokémon **por la frecuencia con que lleva la pieza** (una
  // habilidad de clima está siempre; Trick Room suele ser un movimiento raro del
  // set, así que pesa menos). Así el resultado mide cuánto del meta juega de
  // verdad el plan, no cuántos Pokémon *podrían* llevarlo.
  const prevalence: Record<ArchetypeId, number> = { trickroom: 0, tailwind: 0, weather: 0, setup: 0 }
  const weatherPct = new Map<string, number>()
  for (const u of top) {
    const st = meta.byId[u.id]
    const setMoves = new Map((st?.moves ?? []).map((m) => [m.name, m.pct / 100]))
    const ability = st?.abilities[0]?.name ?? ""
    const freq = (list: readonly string[]) => Math.max(0, ...list.map((m) => setMoves.get(m) ?? 0))
    const trickRoom = setMoves.get("Trick Room") ?? 0
    const tailwind = setMoves.get("Tailwind") ?? 0
    if (trickRoom > 0) prevalence.trickroom += u.pct * trickRoom
    if (tailwind > 0) prevalence.tailwind += u.pct * tailwind
    for (const k of WEATHERS) {
      const conf = Math.max(k.setAbilities.includes(ability) ? 1 : 0, freq(k.setMoves))
      if (conf > 0) {
        prevalence.weather += u.pct * conf
        weatherPct.set(k.key, (weatherPct.get(k.key) ?? 0) + u.pct * conf)
      }
    }
    const setup = freq(SETUP_MOVES)
    if (setup > 0) prevalence.setup += u.pct * setup
  }

  // ── Utilidad común: carreras y prioridad.
  const speeds = team.map((s) => realSpeed(s, dex))
  const opp = threatSpeeds(dex, meta)
  const pctTotal = opp.reduce((a, o) => a + o.pct, 0) || 1
  /** % de amenazas que actuaría antes que yo si el campo se invierte (bajo TR). */
  const beatsUnderTR = (mine: number) => opp.reduce((a, o) => a + (mine < o.speed ? o.pct : 0), 0) / pctTotal
  /** La velocidad se acelera con el rival: control ≠ Tailwind (el suyo no te ayuda). */
  const slows = SPEED_CONTROL.filter((m) => m !== "Tailwind")

  const reports: ArchetypeReport[] = []

  if (prevalence.trickroom > 0) {
    const slowPieces = speeds.filter((v) => v > 0 && beatsUnderTR(v) >= 0.6).length
    reports.push({
      id: "trickroom", label: "Trick Room", prevalence: prevalence.trickroom,
      checks: [
        { label: "Alguien con prioridad, para no depender del orden", ok: someHas(PRIORITY_MOVES) },
        { label: "Al menos 2 piezas lentas que se beneficien del campo invertido", ok: slowPieces >= 2 },
      ],
    })
  }

  if (prevalence.tailwind > 0) {
    reports.push({
      id: "tailwind", label: "Ritmo rápido (Tailwind)", prevalence: prevalence.tailwind,
      checks: [
        { label: "Algo que frene al rival: Trick Room, ondas o bajadas de velocidad", ok: someHas(slows) },
        { label: "Prioridad, para no depender de la carrera", ok: someHas(PRIORITY_MOVES) },
      ],
    })
  }

  if (prevalence.weather > 0) {
    // El tipo que manda: el clima más jugado del meta.
    const dominant = [...weatherPct.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const lead = WEATHER_LEAD_TYPE[dominant]
    const label = `Clima: ${WEATHERS.find((k) => k.key === dominant)?.label ?? ""}`
    const overrides = team.some((_, i) =>
      WEATHERS.some((k) => k.key !== dominant &&
        (k.setAbilities.includes(abilities[i]) || k.setMoves.some((m) => hasMove(i, m)))) ||
      ["Cloud Nine", "Air Lock"].includes(abilities[i]),
    )
    const resists = team.some((_, i) => {
      const pTypes = speciesOf(dex, team[i].id)?.types
      return !!pTypes && !!lead && effVs(lead, pTypes) < 1
    })
    reports.push({
      id: "weather", label, prevalence: prevalence.weather,
      checks: [
        { label: "Tu propio clima u otra forma de anularlo (Cloud Nine / Air Lock)", ok: overrides },
        { label: `Alguien que resista ${lead}`, ok: resists },
      ],
    })
  }

  if (prevalence.setup > 0) {
    const stopper = team.some((_, i) =>
      ANTI_SETUP_MOVES.some((m) => hasMove(i, m)) || ANTI_SETUP_ABILITIES.includes(abilities[i]))
    const wall = team.some((_, i) => {
      const sp = speciesOf(dex, team[i].id)
      return !!sp && sp.baseStats.def + sp.baseStats.spd >= WALL_BULK
    })
    reports.push({
      id: "setup", label: "Seteo rival", prevalence: prevalence.setup,
      checks: [
        { label: "Alguien que detenga el boost (Taunt, Encore, Haze, phazing, Unaware, Foul Play)", ok: stopper },
        { label: "Prioridad, para revanchear el seteo", ok: someHas(PRIORITY_MOVES) },
        { label: "Al menos un muro que aguante el barrido", ok: wall },
      ],
    })
  }

  const total = reports.reduce((a, r) => a + r.prevalence, 0)
  const score = total
    ? reports.reduce((a, r) => a + (r.checks.filter((c) => c.ok).length / r.checks.length) * r.prevalence, 0) / total
    : 0
  return { score: clamp01(score), archetypes: reports }
}

/**
 * Aguante vs. el meta: **% del meta que alguien del equipo puede aguantar**.
 * Para cada amenaza mira su **ataque principal** (el de mayor uso en su set
 * común; si el set no está, su primer tipo STAB) y cuenta como cubierta si
 * **algún miembro lo resiste**. Ponderado por uso, igual que las demás.
 *
 * Es el espejo puro de la «Cobertura ofensiva» (resistir vs. golpear): no
 * mide bulk —eso lo resuelve Amenazas con daño real—, sino si existe respuesta
 * defensiva. Antes pedía que un miembro no fuera débil a los **3** tipos más
 * usados de la amenaza, lo que hundía a los equipos de tipos variados y hacía
 * quedar bien a los de un mismo clúster (un equipo mono-Fuego resistía mejor
 * que uno equilibrado).
 */
export function aguanteMeta(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta) {
  const top = meta.usage.slice(0, TOP_N).filter((u) => speciesOf(dex, u.id))
  const total = top.reduce((a, u) => a + u.pct, 0) || 1
  let acc = 0
  for (const u of top) {
    const oppTypes = speciesOf(dex, u.id)!.types
    const primary = commonAttackTypes(meta.byId[u.id], moves)[0] ?? oppTypes[0]
    if (!primary) continue
    const someoneWall = team.some((s) => {
      const pTypes = speciesOf(dex, s.id)?.types
      return !!pTypes && effVs(primary, pTypes) < 1
    })
    if (someoneWall) acc += u.pct
  }
  return { score: clamp01(acc / total) }
}

/** Armonía compuesta a partir de las métricas (fuente única para cliente y servidor). */
export function harmonyFromMetrics(metrics: Analysis["metrics"]): number {
  return +(100 * clamp01(metrics.offense - REDUNDANCY_WEIGHT * metrics.redundancy)).toFixed(1)
}

export function analyze(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta, opts: AnalyzeOptions = {}): Analysis {
  const d = defensiveBalance(team, dex)
  const o = offensiveCoverage(team, dex, moves, meta)
  const t = opts.closure ? opts.closure(team) : threatClosure(team, dex, moves, meta)
  const r = roleFocus(team, dex, moves, meta)
  const sp = speedProfile(team, dex, meta)
  const red = redundancy(team, dex)

  const metrics = { offense: o.score, redundancy: red }
  const harmony = harmonyFromMetrics(metrics)

  const typeCoverage: TypeCoverage[] = d.breakdown.map((b) => ({
    type: b.type,
    weak: b.weak,
    resist: b.resist,
  }))

  return {
    harmony: +harmony.toFixed(1), metrics, speedScenarios: sp.scenarios,
    unanswered: t.unanswered, roleFocus: r,
    offenseGaps: o.gaps, nakedTypes: d.breakdown.filter((b) => b.weak >= 2 && b.resist === 0).map((b) => b.type),
    typeCoverage,
  }
}
