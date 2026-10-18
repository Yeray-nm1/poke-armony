// Recomendador con DAÑO REAL. Vive fuera del barril `@/core` porque importa
// `@smogon/calc` (vía ./damage): solo se usa en el servidor, de modo que la
// librería nunca entra en el bundle del cliente.
//
// Estrategia: el motor de tipos genera los candidatos (rápido, igual que en el
// cliente) y aquí se les añade el cierre de amenazas **real**. Carta 2: ese
// cierre dejó de ser una métrica — es titular + listas—, así que el daño real ya
// no compone la armonía (sigue siendo por tipos: cliente = servidor). Su papel
// es dar el titular **real** de «Sin respuesta a…», el que ve el usuario.
import type { Analysis } from "./harmony"
import { groupProposals, improvedMetrics, proposeEdits } from "./recommender"
import type { Proposal, RecommendOptions } from "./recommender"
import { damageClosure } from "./damage"
import type { Meta, MoveDex, Pokedex, Team } from "./types"

/** Cuántos candidatos por nivel (ordenados por Δ de tipos) se revisan con daño real. */
const TOP_K_PER_TIER = 12

export interface DamageRecommendation {
  /** Análisis del equipo base con el cierre de amenazas real. */
  analysis: Analysis
  /** Propuestas con el cierre real en su análisis, ordenadas por Δ armonía. */
  proposals: Proposal[]
}

export function recommendWithDamage(
  team: Team,
  dex: Pokedex,
  moves: MoveDex,
  meta: Meta,
  opts: Omit<RecommendOptions, "closure"> = {},
): DamageRecommendation {
  const { base, proposals } = proposeEdits(team, dex, moves, meta, opts)

  // Candidatos a re-puntuar: los mejores de cada nivel por Δ de tipos.
  const grouped = groupProposals(proposals)
  const chosen = [
    ...grouped.tune.slice(0, TOP_K_PER_TIER),
    ...grouped.remake.slice(0, TOP_K_PER_TIER),
    ...grouped.swap.slice(0, TOP_K_PER_TIER),
  ]

  // Titular de cierre con daño REAL: la armonía no cambia (ya no lleva cierre),
  // pero la lista «Sin respuesta a…» y el punto único de fallo sí salen del
  // motor del juego (mismos matchups, ya cacheados).
  const baseClosure = damageClosure(team, dex, meta)
  const analysis: Analysis = { ...base, unanswered: baseClosure.unanswered, criticality: baseClosure.criticality }

  const refined: Proposal[] = []
  for (const p of chosen) {
    const candidate = team.map((s, i) => (i === p.slot ? p.nextSet : s))
    const closure = damageClosure(candidate, dex, meta)
    const after: Analysis = { ...p.after, unanswered: closure.unanswered, criticality: closure.criticality }
    refined.push({ ...p, after, fixes: improvedMetrics(analysis, after) })
  }

  return { analysis, proposals: refined.sort((a, b) => b.delta - a.delta) }
}
