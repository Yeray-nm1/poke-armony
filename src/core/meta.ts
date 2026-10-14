// Agregación pura de teamlists en un `Meta`. Sin I/O: la descarga vive fuera
// del núcleo (`src/lib/meta.ts`, que la sirve cacheada desde `src/lib/data.ts`).
import type { Meta, SetStats } from "./types"

/** Set mínimo que necesitamos de un teamlist para agregar el meta. */
export interface MetaTeamSet {
  id?: string
  name?: string
  item?: string
  ability?: string
  nature?: string
  attacks?: string[]
}

export interface AggregateMetaOptions {
  /** Formato agregado (p. ej. "M-C"). */
  format: string
  /** Nº de torneos incluidos (para mostrarlo en la UI). */
  tournaments: number
  /** Origen de los teamlists (p. ej. "limitlesstcg"). */
  source: string
  /** Fecha de agregación (ISO). Por defecto, ahora. */
  generatedAt?: string
}

function rank(counter: Map<string, number>, total: number) {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count, pct: +((100 * count) / total).toFixed(2) }))
    .sort((a, b) => b.count - a.count)
}

/** Agrega los teamlists en uso (%) por especie + estadísticas de set por especie. */
export function aggregateMeta(teams: MetaTeamSet[][], opts: AggregateMetaOptions): Meta {
  const usage = new Map<string, { name: string; count: number }>()
  const perId: Record<string, { n: number; moves: Map<string, number>; items: Map<string, number>; abilities: Map<string, number>; natures: Map<string, number> }> = {}

  for (const team of teams) {
    for (const set of team) {
      if (!set.id) continue
      const u = usage.get(set.id) ?? { name: set.name ?? set.id, count: 0 }
      u.count++
      usage.set(set.id, u)

      const s = (perId[set.id] ??= { n: 0, moves: new Map(), items: new Map(), abilities: new Map(), natures: new Map() })
      s.n++
      for (const mv of set.attacks ?? []) s.moves.set(mv, (s.moves.get(mv) ?? 0) + 1)
      if (set.item) s.items.set(set.item, (s.items.get(set.item) ?? 0) + 1)
      if (set.ability) s.abilities.set(set.ability, (s.abilities.get(set.ability) ?? 0) + 1)
      if (set.nature) s.natures.set(set.nature, (s.natures.get(set.nature) ?? 0) + 1)
    }
  }

  // El uso (%) es sobre el TOTAL DE EQUIPOS (como en Limitless/Smogon): un Pokémon
  // presente en la mitad de los equipos marca ~50%, no 100/6 ≈ 8% (eso sería sobre sets).
  const totalTeams = teams.length || 1
  const usageList = [...usage.entries()]
    .map(([id, v]) => ({ id, name: v.name, count: v.count, pct: +((100 * v.count) / totalTeams).toFixed(2) }))
    .sort((a, b) => b.count - a.count)

  const byId: Record<string, SetStats> = {}
  for (const [id, s] of Object.entries(perId)) {
    byId[id] = {
      moves: rank(s.moves, s.n),
      items: rank(s.items, s.n),
      abilities: rank(s.abilities, s.n),
      natures: rank(s.natures, s.n),
    }
  }

  return {
    format: opts.format,
    tournaments: opts.tournaments,
    teams: teams.length,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    source: opts.source,
    usage: usageList,
    byId,
  }
}
