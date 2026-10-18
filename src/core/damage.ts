// Daño real con el motor de cálculo de Smogon adaptado a Pokémon Champions.
// `@smogon/calc` incluye una generación "0" = Champions: nivel 50 fijo, Stat
// Points como EVs (1 SP = 1 punto a L50), el roster legal y las Megas nuevas.
// Este módulo es el ÚNICO punto del núcleo que depende de la librería (todo lo
// demás del motor es tipo-based y rápido); lo usa el informe de amenaza, que se
// calcula en el servidor para no inflar el bundle del cliente.
import { calculate, Generations, Move, Pokemon, toID } from "@smogon/calc"
import { criticalityOf, speciesOf } from "./harmony"
import type { Criticality } from "./harmony"
import { natureEffect } from "./stats"
import { evaluateThreat } from "./threat"
import type { ThreatReport } from "./threat"
import { effVs } from "./typechart"
import type { Meta, MoveDex, Pokedex, StatKey, Team, TeamSet } from "./types"
import { STAT_KEYS } from "./types"

type ChampGen = ReturnType<typeof Generations.get>

let cached: ChampGen | null = null
const championGen = (): ChampGen => (cached ??= Generations.get(0))

export interface DamageRoll {
  move: string
  min: number
  max: number
  /** % del HP del defensor, peor / mejor tirada (1-100). */
  pctMin: number
  pctMax: number
  /** Probabilidad de KO (tiradas ≥ HP). */
  koChance: number
  /** El movimiento no está en el set más común mostrado (cobertura a vigilar). */
  coverage?: boolean
}

/**
 * Veredicto de un miembro frente a una amenaza (con daño real):
 * - `counter`: aguanta y puede hacerle KO a la amenaza.
 * - `koMutuo`: la amenaza le hace KO en un golpe y el miembro también la hace KO de uno (KO mutuo).
 *              El resultado (quién pega primero) va en `koRace`.
 * - `neutral`: aguanta, pero no le hace KO.
 * - `weak`:    la amenaza le hace KO y el miembro no llega a hacerle KO.
 */
export type DamageVerdict = "counter" | "koMutuo" | "neutral" | "weak"

/** Quién gana el intercambio de un KO mutuo, según prioridad, velocidad y tipos. */
export type KoRace = "win" | "lose"

export interface MemberDamage {
  slot: number
  /** Daño que recibe el miembro de los ataques principales de la amenaza. */
  incoming: DamageRoll[]
  /** Daño que le hace el miembro a la amenaza. */
  outgoing: DamageRoll[]
  /** ¿Aguanta la peor tirada de todos los ataques de la amenaza? */
  survivesThreat: boolean
  /** ¿Responde de verdad: aguanta Y puede hacerle KO a la amenaza (OHKO ≥50% o 2HKO garantizado)? */
  answers: boolean
  verdict: DamageVerdict
  /** Solo con veredicto `koMutuo`: quién pega primero (prioridad → velocidad → tipos; empate total = derrota). */
  koRace?: KoRace
}

/** Informe de amenaza con daño real por miembro (se compone en el servidor). */
export interface DetailedReport extends ThreatReport {
  damage: MemberDamage[]
  /** ¿Alguien del equipo responde con daño real? */
  damageAnswered: boolean
}

const isDamaging = (gen: ChampGen, name: string): boolean => {
  const m = gen.moves.get(toID(name))
  return !!m && m.category !== "Status" && m.basePower > 0
}

/** Velocidad efectiva (SP + naturaleza) con el único objeto que la cambia y modelamos: Choice Scarf.
 *  El resto (Tailwind, Trick Room, Icy Wind, parálisis, habilidades de clima…) queda fuera a propósito. */
function speedOf(mon: Pokemon): number {
  const spe = mon.stats.spe
  return mon.hasItem("Choice Scarf") ? Math.floor(spe * 1.5) : spe
}

const movePriority = (gen: ChampGen, name: string): number => gen.moves.get(toID(name))?.priority ?? 0

const moveType = (gen: ChampGen, name: string): string => gen.moves.get(toID(name))?.type ?? ""

/** Convierte un set nuestro en un Pokemon del calc, resolviendo la Mega por piedra. */
export function toCalcPokemon(gen: ChampGen, set: TeamSet, dex: Pokedex): Pokemon | null {
  const baseName = speciesOf(dex, set.id)?.name
  if (!baseName || !gen.species.get(toID(baseName))) return null
  let name = baseName
  if (set.item) {
    const stone = gen.items.get(toID(set.item))
    const megaMap = (stone?.megaStone ?? {}) as Record<string, string>
    const forme = megaMap[baseName]
    if (forme) name = forme
  }
  const evs = {} as Record<StatKey, number>
  for (const k of STAT_KEYS) evs[k] = set.sp?.[k] ?? 0
  return new Pokemon(gen, name, {
    item: set.item || undefined,
    ability: set.ability || undefined,
    nature: set.nature || undefined,
    evs,
  })
}

/**
 * El meta (Limitless) no publica Stat Points. Modelamos a la amenaza como
 * "benchmark ofensivo": 32 SP en su stat de ataque principal y 0 en el resto.
 * El stat principal se decide SOLO con los movimientos que se van a simular
 * (los de daño del set común), no con la lista completa del meta.
 */
function threatSpread(gen: ChampGen, attacks: string[]): { sp: Partial<Record<StatKey, number>>; primary?: StatKey } {
  let physical = 0
  let special = 0
  for (const name of attacks) {
    const m = gen.moves.get(toID(name))
    if (!m || m.category === "Status" || m.basePower <= 0) continue
    if (m.category === "Physical") physical++
    else special++
  }
  if (physical === 0 && special === 0) return { sp: {} }
  const primary: StatKey = physical >= special ? "atk" : "spa"
  return { sp: { [primary]: 32 }, primary }
}

/**
 * Naturaleza de la amenaza coherente con su stat de ataque principal: conserva
 * la más común del meta salvo que penalice ese stat (p. ej. Modest + 32 SP en Atk);
 * en tal caso usa la siguiente del meta que no lo penalice, o una neutra.
 */
function coherentNature(natures: { name: string }[] | undefined, primary: StatKey): string | undefined {
  const list = (natures ?? []).map((n) => n.name)
  if (!list.length) return undefined
  const ok = list.find((n) => natureEffect(n).minus !== primary)
  return ok ?? "Serious"
}

function flattenRolls(d: unknown): number[] {
  if (Array.isArray(d)) return d.flatMap(flattenRolls)
  return typeof d === "number" ? [d] : []
}

function summarize(gen: ChampGen, attacker: Pokemon, defender: Pokemon, moveName: string): DamageRoll | null {
  if (!isDamaging(gen, moveName)) return null
  const res = calculate(gen, attacker, defender, new Move(gen, moveName))
  const rolls = flattenRolls(res.damage)
  if (rolls.length === 0) return null
  const min = Math.min(...rolls)
  const max = Math.max(...rolls)
  const hp = defender.maxHP()
  return {
    move: moveName,
    min,
    max,
    pctMin: Math.round((100 * min) / hp),
    pctMax: Math.round((100 * max) / hp),
    koChance: rolls.filter((r) => r >= hp).length / rolls.length,
  }
}

// ── Caché de matchups (miembro × amenaza) ───────────────────────────────
// El recomendador evalúa muchos candidatos que solo cambian UN set: cachear el
// veredicto por (set, amenaza) hace que re-puntuar con daño real sea barato.
const CACHE_CAP = 24000
const memberModels = new Map<string, Pokemon | null>()
const threatModels = new Map<string, { mon: Pokemon; moves: string[]; setMoves: string[] } | null>()
const matchups = new Map<string, MemberDamage>()

const sigOf = (set: TeamSet): string =>
  JSON.stringify([set.id, set.item ?? "", set.ability ?? "", set.nature ?? "", set.attacks, set.sp ?? {}])

function threatModel(gen: ChampGen, threatId: string, dex: Pokedex, meta: Meta): { mon: Pokemon; moves: string[]; setMoves: string[] } | null {
  const hit = threatModels.get(threatId)
  if (hit !== undefined) return hit
  const stats = meta.byId[threatId]
  const allMoves = (stats?.moves ?? []).map((m) => m.name)
  // Solo los 4 movimientos de daño que se van a simular (los primeros del set común).
  const moves = allMoves.filter((m) => isDamaging(gen, m)).slice(0, 4)
  const { sp, primary } = threatSpread(gen, moves)
  const nature = primary ? coherentNature(stats?.natures, primary) : stats?.natures[0]?.name
  const threat: TeamSet = {
    id: threatId, attacks: moves,
    item: stats?.items[0]?.name, ability: stats?.abilities[0]?.name,
    nature, sp,
  }
  const mon = toCalcPokemon(gen, threat, dex)
  const res = mon ? { mon, moves, setMoves: allMoves.slice(0, 4) } : null
  threatModels.set(threatId, res)
  return res
}

function memberModel(gen: ChampGen, set: TeamSet, dex: Pokedex): Pokemon | null {
  const key = sigOf(set)
  const hit = memberModels.get(key)
  if (hit !== undefined) return hit
  const mon = toCalcPokemon(gen, set, dex)
  memberModels.set(key, mon)
  return mon
}

/** Matchup de un miembro frente a una amenaza (cacheado por set × amenaza). */
function memberDamage(gen: ChampGen, set: TeamSet, slot: number, threatId: string, dex: Pokedex, meta: Meta): MemberDamage {
  const key = `${sigOf(set)}|${threatId}`
  const cached = matchups.get(key)
  if (cached) return { ...cached, slot }
  const th = threatModel(gen, threatId, dex, meta)
  const mon = memberModel(gen, set, dex)
  let res: MemberDamage
  if (!th || !mon) {
    res = { slot, incoming: [], outgoing: [], survivesThreat: false, answers: false, verdict: "neutral" }
  } else {
    const incoming = th.moves
      .map((m) => summarize(gen, th.mon, mon, m))
      .filter((r): r is DamageRoll => !!r)
      .map((r) => ({ ...r, coverage: !th.setMoves.includes(r.move) }))
    const outgoing = (set.attacks ?? [])
      .filter((m) => isDamaging(gen, m)).slice(0, 4)
      .map((m) => summarize(gen, mon, th.mon, m)).filter((r): r is DamageRoll => !!r)
    const survivesThreat = incoming.length === 0 || Math.max(...incoming.map((r) => r.pctMin)) < 100
    // "Tumba a la amenaza" = ALGÚN ataque es OHKO con ≥50% de probabilidad o 2HKO
    // garantizado. Se comprueba el conjunto entero (no solo el de mayor koChance)
    // para que el resultado no dependa del orden de los movimientos.
    const kos = outgoing.some((r) => r.pctMin >= 50 || r.koChance >= 0.5)
    // KO mutuo: la amenaza nos OHKO (peor tirada ≥ 100%) y nosotros también la OHKO.
    const ourKo = outgoing.filter((r) => r.koChance >= 0.5)
    const theirKo = incoming.filter((r) => r.pctMin >= 100)
    const mutual = theirKo.length > 0 && ourKo.length > 0
    // Quién pega primero: prioridad del mejor movimiento KO de cada lado; si empatan, velocidad;
    // si también empatan, efectividad de tipos. Un empate total se resuelve como derrota (peor escenario).
    let koRace: KoRace | undefined
    if (mutual) {
      const ourPri = Math.max(...ourKo.map((r) => movePriority(gen, r.move)))
      const theirPri = Math.max(...theirKo.map((r) => movePriority(gen, r.move)))
      if (ourPri !== theirPri) koRace = ourPri > theirPri ? "win" : "lose"
      else {
        const ourSpe = speedOf(mon)
        const theirSpe = speedOf(th.mon)
        if (ourSpe !== theirSpe) koRace = ourSpe > theirSpe ? "win" : "lose"
        else {
          const ourMult = Math.max(...ourKo.map((r) => effVs(moveType(gen, r.move), th.mon.types)))
          const theirMult = Math.max(...theirKo.map((r) => effVs(moveType(gen, r.move), mon.types)))
          koRace = ourMult > theirMult ? "win" : "lose"
        }
      }
    }
    const verdict: DamageVerdict =
      survivesThreat && kos ? "counter" : mutual ? "koMutuo" : survivesThreat ? "neutral" : "weak"
    // Un KO mutuo ganado por velocidad/prioridad cuenta como respuesta (con el aviso de speed control).
    const answers = (survivesThreat && kos) || (mutual && koRace === "win")
    res = { slot, incoming, outgoing, survivesThreat, answers, verdict, koRace }
  }
  if (matchups.size > CACHE_CAP) matchups.clear()
  matchups.set(key, res)
  return res
}

/** Matchups con daño real de cada miembro frente a la amenaza. */
export function damageMatchups(team: Team, threatId: string, dex: Pokedex, meta: Meta): MemberDamage[] {
  const gen = championGen()
  if (!threatModel(gen, threatId, dex, meta)) return []
  return team.map((set, slot) => memberDamage(gen, set, slot, threatId, dex, meta))
}

/**
 * Cierre de amenazas con daño REAL: una amenaza está "cerrada" si algún miembro
 * la responde de verdad (aguanta la peor tirada Y puede hacerle KO). Misma regla
 * que el panel de amenaza. `unanswered` es la lista de amenazas sin respuesta.
 */
export function damageClosure(
  team: Team,
  dex: Pokedex,
  meta: Meta,
  topN = 20,
): { score: number; unanswered: string[]; criticality: Criticality } {
  const gen = championGen()
  const top = meta.usage.slice(0, topN).filter((u) => speciesOf(dex, u.id))
  const total = top.reduce((a, u) => a + u.pct, 0)
  const unanswered: string[] = []
  const answerers: number[][] = []
  let answered = 0
  for (const u of top) {
    const solvers: number[] = []
    team.forEach((set, slot) => {
      if (memberDamage(gen, set, slot, u.id, dex, meta).answers) solvers.push(slot)
    })
    answerers.push(solvers)
    if (solvers.length) answered += u.pct
    else unanswered.push(u.id)
  }
  return { score: total ? answered / total : 0, unanswered, criticality: criticalityOf(top, answerers, team, dex) }
}

/** Informe completo: tipos + set común + matchup real por miembro. */
export function detailedReport(team: Team, threatId: string, dex: Pokedex, moves: MoveDex, meta: Meta): DetailedReport {
  const report = evaluateThreat(team, threatId, dex, moves, meta)
  const damage = damageMatchups(team, threatId, dex, meta)
  return { ...report, damage, damageAnswered: damage.some((d) => d.answers) }
}

export { championGen }