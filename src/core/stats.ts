// Cálculo de stats a Nivel 50 (31 IVs) con el sistema de Stat Points de Champions.
// 1 SP = 8 EV ⇒ a L50 cada SP vale exactamente 1 punto de stat.
import { STAT_KEYS, type SpeciesData, type StatKey, type TeamSet } from "./types"

export const LEVEL = 50
export const IV = 31
export const SP_TOTAL = 66
export const SP_MAX = 32
export const SP_PER_EV = 8

type Nature = { plus?: StatKey; minus?: StatKey }

// Las 5 naturalezas neutras (Hardy/Docile/Serious/Bashful/Quirky) no aparecen → sin efecto.
export const NATURES: Record<string, Nature> = {
  Lonely: { plus: "atk", minus: "def" },
  Brave: { plus: "atk", minus: "spe" },
  Adamant: { plus: "atk", minus: "spa" },
  Naughty: { plus: "atk", minus: "spd" },
  Bold: { plus: "def", minus: "atk" },
  Relaxed: { plus: "def", minus: "spe" },
  Impish: { plus: "def", minus: "spa" },
  Lax: { plus: "def", minus: "spd" },
  Timid: { plus: "spe", minus: "atk" },
  Hasty: { plus: "spe", minus: "def" },
  Jolly: { plus: "spe", minus: "spa" },
  Naive: { plus: "spe", minus: "spd" },
  Modest: { plus: "spa", minus: "atk" },
  Mild: { plus: "spa", minus: "def" },
  Quiet: { plus: "spa", minus: "spe" },
  Rash: { plus: "spa", minus: "spd" },
  Calm: { plus: "spd", minus: "atk" },
  Gentle: { plus: "spd", minus: "def" },
  Sassy: { plus: "spd", minus: "spe" },
  Careful: { plus: "spd", minus: "spa" },
}

export const NEUTRAL_NATURES = ["Hardy", "Docile", "Serious", "Bashful", "Quirky"]
export const NATURE_NAMES = [...Object.keys(NATURES), ...NEUTRAL_NATURES].sort()

export function statAt50(base: number, sp: number, key: StatKey, nature?: string): number {
  const raw = Math.floor(((2 * base + IV + 2 * sp) * LEVEL) / 100)
  if (key === "hp") return raw + LEVEL + 10
  let value = raw + 5
  const n = nature ? NATURES[nature] : undefined
  if (n?.plus === key) value = Math.floor(value * 1.1)
  else if (n?.minus === key) value = Math.floor(value * 0.9)
  return value
}

/** Bloque de stats reales a L50 de un set. */
export function statsAt50(species: SpeciesData, set: TeamSet): Record<StatKey, number> {
  const out = {} as Record<StatKey, number>
  for (const key of STAT_KEYS) {
    out[key] = statAt50(species.baseStats[key], set.sp?.[key] ?? 0, key, set.nature)
  }
  return out
}

export function spUsed(set: TeamSet): number {
  return STAT_KEYS.reduce((sum, k) => sum + (set.sp?.[k] ?? 0), 0)
}

/** Valida el reparto de SP de Champions (máx 32/stat, 66 en total). */
export function isValidSpread(set: TeamSet): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  for (const key of STAT_KEYS) {
    const v = set.sp?.[key] ?? 0
    if (v < 0 || v > SP_MAX) errors.push(`${key}: ${v} SP (máx ${SP_MAX})`)
  }
  const total = spUsed(set)
  if (total > SP_TOTAL) errors.push(`total ${total} SP (máx ${SP_TOTAL})`)
  return { ok: errors.length === 0, errors }
}

/** Máximo de SP asignables a `key` sin que el total del set pase de 66. */
export function maxSpAllowed(set: TeamSet, key: StatKey): number {
  const others = STAT_KEYS.reduce((sum, k) => (k === key ? sum : sum + (set.sp?.[k] ?? 0)), 0)
  return Math.max(0, Math.min(SP_MAX, SP_TOTAL - others))
}

/**
 * Recorta `value` a un reparto legal al asignar SP a `key`: redondea, lo acota
 * a [0, 32] y evita que la suma del set supere los 66 SP.
 */
export function clampSp(set: TeamSet, key: StatKey, value: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : 0
  return Math.max(0, Math.min(maxSpAllowed(set, key), n))
}

/**
 * Repara un reparto de SP (p. ej. al importar): acota a [0, 32] y, si la suma
 * pasa de 66, recorta el exceso restando a partes iguales desde las
 * estadísticas más altas (redondeando por turnos).
 * Devuelve solo las stats con valor > 0.
 */
export function normalizeSpread(sp?: TeamSet["sp"]): Partial<Record<StatKey, number>> {
  const values = STAT_KEYS.map((k) => {
    const raw = sp?.[k] ?? 0
    const v = Number.isFinite(raw) ? Math.round(raw) : 0
    return Math.max(0, Math.min(SP_MAX, v))
  })
  let excess = Math.max(0, values.reduce((a, b) => a + b, 0) - SP_TOTAL)
  while (excess > 0) {
    let idx = -1
    for (let i = 0; i < values.length; i++) {
      if (values[i] > 0 && (idx < 0 || values[i] > values[idx])) idx = i
    }
    if (idx < 0) break
    values[idx] -= 1
    excess -= 1
  }
  const out: Partial<Record<StatKey, number>> = {}
  STAT_KEYS.forEach((k, i) => {
    if (values[i] > 0) out[k] = values[i]
  })
  return out
}

/** Efecto de una naturaleza: neutra, o el stat que sube (+) y el que baja (−). */
export function natureEffect(nature?: string): { neutral: boolean; plus?: StatKey; minus?: StatKey } {
  const n = nature ? NATURES[nature] : undefined
  if (!n) return { neutral: true }
  return { neutral: !n.plus && !n.minus, plus: n.plus, minus: n.minus }
}
