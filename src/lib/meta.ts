// Ingesta del meta vivo desde Limitless TCG (server-only: usa `fetch`).
// La sirve cacheada `src/lib/data.ts` (`getMeta`).
import { aggregateMeta, type MetaTeamSet } from "@/core/meta"
import type { Meta } from "@/core/types"
import { getJSON, sleep } from "./http"

export const META_API = "https://play.limitlesstcg.com/api"
export const META_FORMAT = "M-C"
export const META_SOURCE = "limitlesstcg"
/** Cuántos torneos recientes agregamos como máximo. */
const MAX_TOURNAMENTS = 8
/** Mínimo de jugadores para considerar un torneo representativo. */
const MIN_PLAYERS = 8

/** Descarga las clasificaciones recientes del formato y las agrega en un `Meta`. */
export async function fetchMeta(): Promise<Meta> {
  const tours = await getJSON<{ id: string; players: number }[]>(
    `${META_API}/tournaments?game=VGC&format=${META_FORMAT}&limit=12`,
  )
  const valid = tours.filter((t) => t.players >= MIN_PLAYERS).slice(0, MAX_TOURNAMENTS)
  const teams: MetaTeamSet[][] = []
  for (const t of valid) {
    await sleep(250)
    const standings = await getJSON<{ decklist?: MetaTeamSet[] }[]>(`${META_API}/tournaments/${t.id}/standings`)
    for (const p of standings) if (Array.isArray(p.decklist) && p.decklist.length === 6) teams.push(p.decklist)
  }
  return aggregateMeta(teams, { format: META_FORMAT, tournaments: valid.length, source: META_SOURCE })
}
