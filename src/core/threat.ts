// Detalle de una amenaza del meta: su set más común y cómo responde cada
// miembro del equipo. Puro (sin I/O), reutiliza los helpers de `harmony`.
import { commonAttackTypes, speciesOf, toId } from "./harmony"
import { effVs } from "./typechart"
import type { Meta, MoveDex, Pokedex, Team } from "./types"

export type Verdict = "counter" | "neutral" | "weak"

export interface ThreatSet {
  item?: string
  ability?: string
  nature?: string
  moves: string[]
}

export interface Matchup {
  slot: number
  id: string
  name: string
  types: string[]
  verdict: Verdict
  reason: string
}

export interface ThreatReport {
  id: string
  name: string
  types: string[]
  usage: number
  commonSet: ThreatSet
  /** Tipos de ataque principales de la amenaza (STAB/set común). */
  attackTypes: string[]
  matchups: Matchup[]
  /** ¿El equipo tiene al menos un fuerte real? */
  answered: boolean
}

export function evaluateThreat(
  team: Team,
  threatId: string,
  dex: Pokedex,
  moves: MoveDex,
  meta: Meta,
): ThreatReport {
  const species = speciesOf(dex, threatId)
  const oppTypes = species?.types ?? []
  const stats = meta.byId[threatId]
  const fromSet = commonAttackTypes(stats, moves)
  const attackTypes = fromSet.length ? fromSet : oppTypes
  const usage = meta.usage.find((u) => toId(u.id) === toId(threatId))?.pct ?? 0

  const commonSet: ThreatSet = {
    item: stats?.items[0]?.name,
    ability: stats?.abilities[0]?.name,
    nature: stats?.natures[0]?.name,
    moves: (stats?.moves ?? []).slice(0, 4).map((m) => m.name),
  }

  const matchups: Matchup[] = team.map((set, slot) => {
    const mon = speciesOf(dex, set.id)
    const pTypes = mon?.types ?? []
    const noWeak = attackTypes.every((at) => effVs(at, pTypes) <= 1)
    const resists = attackTypes.some((at) => effVs(at, pTypes) < 1)
    const threatens = set.attacks.some((mvn) => {
      const m = moves[toId(mvn)]
      return !!m && m.category !== "Status" && m.basePower > 0 && effVs(m.type, oppTypes) >= 2
    })

    let verdict: Verdict = "neutral"
    let reason = "no destaca ni a favor ni en contra"
    if (!noWeak) {
      const weakTo = attackTypes.filter((at) => effVs(at, pTypes) > 1)
      verdict = "weak"
      reason = `débil a ${weakTo.join(" / ")}`
    } else if (resists && threatens) {
      verdict = "counter"
      reason = "resiste su ataque y le golpea súper eficaz"
    } else if (resists) {
      reason = "resiste su ataque, pero no le amenaza"
    } else if (threatens) {
      reason = "le golpea súper eficaz, pero no resiste"
    }
    return { slot, id: set.id, name: mon?.name ?? set.name ?? set.id, types: pTypes, verdict, reason }
  })

  return {
    id: threatId,
    name: species?.name ?? threatId,
    types: oppTypes,
    usage,
    commonSet,
    attackTypes,
    matchups,
    answered: matchups.some((m) => m.verdict === "counter"),
  }
}
