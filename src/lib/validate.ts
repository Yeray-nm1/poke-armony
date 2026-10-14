// Validación de los cuerpos que llegan a las rutas de la API
// (`/api/recommend` y `/api/threat-report`).
//
// Comprueba la FORMA (tipos, longitudes y tope de sets) y devuelve un `Team`
// reconstruido solo con los campos del contrato. Así un cuerpo malformado nunca
// llega al motor (antes reventaba con un 500) ni un payload enorme lo ahoga.
//
// No juzga reglas de juego (SP fuera de rango, ids desconocidos…): de eso ya se
// encargan el motor y sus normalizadores, y rechazarlo aquí rompería estados que
// la propia UI permite ver (p. ej. un reparto con aviso).

import { SP_MAX, STAT_KEYS } from "@/core"
import type { StatKey, Team, TeamSet } from "@/core/types"

/** Tope de sets: el store ya corta el equipo a 6 (`setTeam`). */
export const MAX_SETS = 6
/** Tope defensivo de movimientos por set (el motor solo mira los 6 primeros). */
export const MAX_ATTACKS = 24
/** Tope defensivo de longitud para los textos de un set. */
export const MAX_TEXT = 64

export type Invalid = { ok: false; error: string }
export type Valid<T> = { ok: true; value: T } | Invalid

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Texto opcional del set (`name`, `item`, `ability`, `nature`). */
function checkText(value: unknown, field: string): Invalid | null {
  if (value === undefined) return null
  if (typeof value !== "string") return { ok: false, error: `"${field}" debe ser texto` }
  if (value.length > MAX_TEXT) return { ok: false, error: `"${field}" supera ${MAX_TEXT} caracteres` }
  return null
}

/** Reparto de SP: objeto con claves de stat y valores entre 0 y 32. */
function validateSp(raw: unknown): Valid<TeamSet["sp"]> {
  if (raw === undefined) return { ok: true, value: undefined }
  if (!isRecord(raw)) return { ok: false, error: '"sp" debe ser un objeto { stat: número }' }
  const sp: Partial<Record<StatKey, number>> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!STAT_KEYS.includes(key as StatKey)) {
      return { ok: false, error: `stat desconocido en "sp": "${key}"` }
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `"sp.${key}" debe ser un número finito` }
    }
    if (value < 0 || value > SP_MAX) {
      return { ok: false, error: `"sp.${key}" fuera de rango (0–${SP_MAX})` }
    }
    sp[key as StatKey] = value
  }
  return { ok: true, value: sp }
}

/** Un set: `{ id, attacks }` obligatorios; el resto, opcional. */
function validateSet(raw: unknown, index: number): Valid<TeamSet> {
  const at = `set ${index + 1}`
  if (!isRecord(raw)) return { ok: false, error: `${at}: debe ser un objeto` }
  if (typeof raw.id !== "string") return { ok: false, error: `${at}: falta "id" (texto)` }
  if (raw.id.length > MAX_TEXT) return { ok: false, error: `${at}: "id" supera ${MAX_TEXT} caracteres` }
  if (!Array.isArray(raw.attacks)) return { ok: false, error: `${at}: falta "attacks" (texto[])` }
  if (raw.attacks.length > MAX_ATTACKS) {
    return { ok: false, error: `${at}: demasiados movimientos (máx ${MAX_ATTACKS})` }
  }
  const attacks: string[] = []
  for (const move of raw.attacks) {
    if (typeof move !== "string") return { ok: false, error: `${at}: los movimientos deben ser texto` }
    if (move.length > MAX_TEXT) {
      return { ok: false, error: `${at}: un movimiento supera ${MAX_TEXT} caracteres` }
    }
    // Vacío es legítimo: el editor rellena huecos con "" (`setMove`).
    attacks.push(move)
  }
  const sp = validateSp(raw.sp)
  if (!sp.ok) return { ok: false, error: `${at}: ${sp.error}` }
  const set: TeamSet = { id: raw.id, attacks }
  for (const field of ["name", "item", "ability", "nature"] as const) {
    const value = raw[field]
    const bad = checkText(value, field)
    if (bad) return { ok: false, error: `${at}: ${bad.error}` }
    if (typeof value === "string") set[field] = value
  }
  if (sp.value) set.sp = sp.value
  return { ok: true, value: set }
}

/** Equipo del cuerpo `{ team }`: entre 1 y 6 sets bien formados. */
export function validateTeam(raw: unknown): Valid<Team> {
  if (!Array.isArray(raw)) return { ok: false, error: "se esperaba { team: [...] }" }
  if (raw.length === 0) return { ok: false, error: "el equipo está vacío" }
  if (raw.length > MAX_SETS) {
    return { ok: false, error: `el equipo no puede tener más de ${MAX_SETS} Pokémon (recibidos ${raw.length})` }
  }
  const team: Team = []
  for (let i = 0; i < raw.length; i++) {
    const set = validateSet(raw[i], i)
    if (!set.ok) return set
    team.push(set.value)
  }
  return { ok: true, value: team }
}

/** Amenaza del cuerpo `{ threatId }`: texto no vacío y acotado. */
export function validateThreatId(raw: unknown): Valid<string> {
  if (typeof raw !== "string") return { ok: false, error: "se esperaba { threatId }" }
  if (raw.length === 0) return { ok: false, error: '"threatId" está vacío' }
  if (raw.length > MAX_TEXT) return { ok: false, error: `"threatId" supera ${MAX_TEXT} caracteres` }
  return { ok: true, value: raw }
}
