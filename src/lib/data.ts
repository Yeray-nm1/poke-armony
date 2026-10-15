// Carga de datos para el servidor (server components / route handlers).
// El núcleo es puro; este módulo es la frontera con la ingesta en runtime.
//
// Decisión de diseño: **API-only**. El dataset se ingiere siempre desde las
// fuentes vivas (Showdown + roster de Champions y Limitless) y se sirve desde el
// cache. El build de Vercel necesita red para las rutas que prerenderiza.
//
// Red de seguridad: cada ingesta correcta se guarda en Vercel Blob (`./snapshot`)
// y, si una fuente no responde, se sirve esa última copia en vez de un error.
// Sigue siendo API-only: la copia solo entra como último recurso.
import { cacheLife, cacheTag } from "next/cache"
import type { Dataset, ItemDex, Meta, MoveDex, Pokedex } from "@/core/types"
import { fetchBase } from "./dataset"
import { fetchMeta } from "./meta"
import { saveSnapshot, withFallback } from "./snapshot"

/** Todo el dataset salvo el meta (roster, movimientos, legales, objetos y learnsets). */
type BaseDataset = Omit<Dataset, "meta">

/**
 * Datos base (roster, movimientos, legales, objetos y learnsets). Se ingieren en
 * runtime desde Showdown y se cachean con `"use cache"`; cambian rara vez, así
 * que en producción viven una semana y en desarrollo una hora. Para forzar su
 * re-ingesta sin redeploy: `revalidateTag("data:base")` (botón "Actualizar datos").
 */
export function getBase(): Promise<BaseDataset> {
  return withFallback(["base", "base-battle"], cachedBase)
}

async function cachedBase(): Promise<BaseDataset> {
  "use cache"
  cacheTag("data:base")
  if (process.env.NODE_ENV === "production") cacheLife("weeks")
  else cacheLife("hours")
  const data = await fetchBase()
  await saveSnapshot("base", data)
  return data
}

/**
 * Meta vivo: se ingiere en runtime desde Limitless y se cachea con revalidación.
 * Vive en el *static shell* de la página, así que `"use cache"` basta (el doc lo
 * recomienda para este caso); en Vercel el incremental cache es durable.
 * Para refrescarlo sin redeploy basta con `revalidateTag("data:meta")`
 * (botón "Actualizar datos" → `POST /api/refresh`).
 */
export function getMeta(): Promise<Meta> {
  return withFallback(["meta"], cachedMeta)
}

async function cachedMeta(): Promise<Meta> {
  "use cache"
  cacheTag("data:meta")
  // Revalida en segundo plano cada 6 h; aguanta una semana sin servir vacío.
  cacheLife({ stale: 300, revalidate: 21600, expire: 604800 })
  const data = await fetchMeta()
  await saveSnapshot("meta", data)
  return data
}

/** Dataset completo para componentes de servidor y route handlers. */
export async function getDataset(): Promise<Dataset> {
  const [base, meta] = await Promise.all([getBase(), getMeta()])
  return { ...base, meta }
}

/** Datos que necesita el motor en los route handlers (`@smogon/calc`): sin learnsets. */
export type BattleData = Pick<Dataset, "pokedex" | "moves" | "legal" | "meta">

/**
 * Datos de batalla para los route handlers, con **cache remoto** (`"use cache: remote"`).
 *
 * Los endpoints son dinámicos: en serverless cada petición puede caer en una
 * instancia nueva, donde el cache en memoria de `"use cache"` no reutiliza nada y
 * se re-ingeriría Showdown + Limitless en cada llamada (~5 s). El cache remoto
 * (Runtime Cache en Vercel) es compartido y durable, así que la ingesta se reutiliza
 * entre invocaciones. Se guardan dos entradas (base sin learnsets ~1 MB y meta
 * ~83 KB) para no acercarse al límite de 2 MB por entrada del cache remoto.
 */
export async function getBattle(): Promise<BattleData> {
  const [base, meta] = await Promise.all([
    withFallback(["base-battle", "base"], cachedBattleBase),
    withFallback(["meta"], cachedBattleMeta),
  ])
  return { pokedex: base.pokedex, moves: base.moves, legal: base.legal, meta }
}

async function cachedBattleBase(): Promise<BaseDataset> {
  "use cache: remote"
  cacheTag("data:base")
  if (process.env.NODE_ENV === "production") cacheLife("weeks")
  else cacheLife("hours")
  const data = await fetchBase({ learnsets: false })
  await saveSnapshot("base-battle", data)
  return data
}

async function cachedBattleMeta(): Promise<Meta> {
  "use cache: remote"
  cacheTag("data:meta")
  // Revalida en segundo plano cada 6 h; aguanta una semana sin servir vacío.
  cacheLife({ stale: 300, revalidate: 21600, expire: 604800 })
  const data = await fetchMeta()
  await saveSnapshot("meta", data)
  return data
}

/** Recorta el dataset a solo lo que el motor y la UI necesitan (menos payload al cliente). */
export function slimDataset(ds: Dataset): Dataset {
  const pokedex: Pokedex = {}
  for (const [id, s] of Object.entries(ds.pokedex)) {
    pokedex[id] = { name: s.name, types: s.types, baseStats: s.baseStats, abilities: s.abilities, hiddenAbilities: s.hiddenAbilities }
  }
  const moves: MoveDex = {}
  for (const [id, m] of Object.entries(ds.moves)) {
    moves[id] = {
      name: m.name,
      type: m.type,
      category: m.category,
      basePower: m.basePower,
      accuracy: m.accuracy,
      shortDesc: m.shortDesc,
      desc: m.desc,
    }
  }
  const items: ItemDex = {}
  for (const [id, it] of Object.entries(ds.items ?? {})) {
    items[id] = { name: it.name, shortDesc: it.shortDesc, tags: it.tags }
  }
  return { pokedex, moves, meta: ds.meta, legal: ds.legal, learnsets: ds.learnsets, items }
}
