// Recomendador con DAÑO REAL. Vive fuera del barril `@/core` porque importa
// `@smogon/calc` (vía ./damage): solo se usa en el servidor, de modo que la
// librería nunca entra en el bundle del cliente.
//
// Estrategia "re-puntúa los mejores": el motor de tipos genera los candidatos
// (rápido, igual que en el cliente) y aquí se re-puntúa con daño real el equipo
// base y los mejores candidatos de cada nivel. La armonía se recompone con el
// cierre de amenazas real; el resto de métricas son las mismas.
import { harmonyFromMetrics } from "./harmony"
import type { Analysis } from "./harmony"
import { groupProposals, improvedMetrics, proposeEdits } from "./recommender"
import type { Proposal, RecommendOptions } from "./recommender"
import { damageClosure } from "./damage"
import type { Meta, MoveDex, Pokedex, Team } from "./types"

/** Cuántos candidatos por nivel (ordenados por Δ de tipos) se re-puntúan con daño. */
const TOP_K_PER_TIER = 12

export interface DamageRecommendation {
  /** Análisis del equipo base con el cierre de amenazas real. */
  analysis: Analysis
  /** Propuestas re-puntuadas, ordenadas por Δ armonía (daño real). */
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

  // Equipo base con cierre real.
  const baseClosure = damageClosure(team, dex, meta)
  const baseMetrics = { ...base.metrics, threatClosure: baseClosure.score }
  const baseHarmony = harmonyFromMetrics(baseMetrics)
  const analysis: Analysis = { ...base, harmony: baseHarmony, metrics: baseMetrics, unanswered: baseClosure.unanswered }

  const refined: Proposal[] = []
  for (const p of chosen) {
    const candidate = team.map((s, i) => (i === p.slot ? p.nextSet : s))
    const closure = damageClosure(candidate, dex, meta)
    const metrics = { ...p.after.metrics, threatClosure: closure.score }
    const harmony = harmonyFromMetrics(metrics)
    const delta = +(harmony - baseHarmony).toFixed(1)
    if (delta <= 0) continue
    const after: Analysis = { ...p.after, harmony, metrics, unanswered: closure.unanswered }
    refined.push({ ...p, delta, after, fixes: improvedMetrics(analysis, after) })
  }

  return { analysis, proposals: refined.sort((a, b) => b.delta - a.delta) }
}
