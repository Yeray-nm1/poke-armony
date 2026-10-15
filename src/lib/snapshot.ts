// Copia de seguridad de "último dato bueno" en Vercel Blob.
//
// La ingesta es *API-only*: si Showdown o Limitless no responden —o fallan justo
// después de un deploy, con el cache frío— la app se queda sin datos. Aquí
// guardamos el último resultado válido de cada dataset y lo devolvemos como
// último recurso, para degradar a "datos de hace X" en vez de a un error.
//
// Sin `BLOB_READ_WRITE_TOKEN` (desarrollo local, tests) el módulo es un no-op:
// la app conserva su comportamiento *API-only* de siempre.
import { head, put } from "@vercel/blob"

/** Prefijo de los blobs, para no mezclarlos con nada más del store. */
const PREFIX = "pokearmony"

/** Recurso guardado, con el instante en que se capturó (para avisar de su antigüedad). */
export interface Snapshot<T> {
  savedAt: string
  data: T
}

const readToken = (): string | undefined => process.env.BLOB_READ_WRITE_TOKEN
const pathOf = (name: string): string => `${PREFIX}/${name}.json`

/** Guarda `data` como último dato bueno de `name`. Best-effort: nunca lanza. */
export async function saveSnapshot<T>(name: string, data: T): Promise<void> {
  const token = readToken()
  if (!token) return
  try {
    const snapshot: Snapshot<T> = { savedAt: new Date().toISOString(), data }
    await put(pathOf(name), JSON.stringify(snapshot), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token,
    })
  } catch (err) {
    console.warn(`[snapshot] no se pudo guardar "${name}" en Blob:`, err)
  }
}

/** Lee el último dato bueno de `name`. `null` si no existe, no hay token o falla. */
export async function loadSnapshot<T>(name: string): Promise<Snapshot<T> | null> {
  const token = readToken()
  if (!token) return null
  try {
    const { url } = await head(pathOf(name), { token })
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as Snapshot<T>
  } catch {
    return null
  }
}

/**
 * Ejecuta `load`; si falla, devuelve el primer snapshot disponible de `names`
 * (en orden de preferencia). Sin copia disponible, re-lanza el error original.
 *
 * El *write-through* va aparte, dentro de cada función `"use cache"`, para que
 * solo se guarde cuando de verdad hay una ingesta (no en cada acierto de cache).
 */
export interface Fetched<T> {
  data: T
  /** `true` si la fuente viva falló y `data` salió de la copia de Blob. */
  stale: boolean
  /** Instante de la copia usada (solo presente si `stale`). */
  savedAt?: string
}

export async function withFallback<T>(names: readonly string[], load: () => Promise<T>): Promise<Fetched<T>> {
  try {
    return { data: await load(), stale: false }
  } catch (err) {
    for (const name of names) {
      const snapshot = await loadSnapshot<T>(name)
      if (snapshot) {
        console.warn(`[snapshot] "${names[0]}" no disponible; uso "${name}" del ${snapshot.savedAt}`)
        return { data: snapshot.data, stale: true, savedAt: snapshot.savedAt }
      }
    }
    throw err
  }
}
