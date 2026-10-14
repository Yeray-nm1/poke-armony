// Tipos compartidos del núcleo. Todo el motor trabaja sobre estos contratos,
// de modo que pueda alimentarse desde cualquier fuente (datos del meta, tests, fixtures).

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe"

export const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"]

export interface TeamSet {
  /** id estilo Showdown (p. ej. "arcanine-hisui"). */
  id: string
  name?: string
  item?: string
  ability?: string
  nature?: string
  attacks: string[]
  /** Stat Points (1 SP = 8 EV). Máx 32 por stat, 66 en total. */
  sp?: Partial<Record<StatKey, number>>
}

export type Team = TeamSet[]

export interface SpeciesData {
  name?: string
  types: string[]
  baseStats: Record<StatKey, number>
  /** Habilidades posibles (primaria, secundaria, oculta...). */
  abilities?: string[]
  /** Subconjunto de `abilities` que son ocultas (slot "H" de Showdown). */
  hiddenAbilities?: string[]
}

export type Pokedex = Record<string, SpeciesData>

export interface MoveData {
  name?: string
  type: string
  category: "Physical" | "Special" | "Status"
  basePower: number
  /** Precisión (número) o `true` si el movimiento nunca falla. */
  accuracy?: number | true
  /** Descripción corta del efecto (Showdown). */
  shortDesc?: string
  /** Descripción completa del efecto (Showdown). */
  desc?: string
}

export type MoveDex = Record<string, MoveData>

/**
 * Learnset de una especie: nombre de movimiento → códigos de aprendizaje de
 * Showdown. Cada código es `<generación><método><detalle>`, p. ej. `9M` (MT de
 * gen 9), `9L44` (nivel 44), `7T` (Tutor), `9E` (Herencia), `9S` (Evento),
 * `9V` (transfer de consola virtual), `5D` (Dream World), `9R` (especial).
 */
export type Learnsets = Record<string, Record<string, string[]>>

/** Descripciones de movimiento extraídas del repo de Showdown (`data/text/moves.ts`). */
export type MoveText = Record<string, { shortDesc?: string; desc?: string }>

export interface ItemData {
  name: string
  /** Descripción corta del efecto (Showdown). */
  shortDesc?: string
  /** Descripción completa del efecto (Showdown). */
  desc?: string
  /** Etiquetas para filtrar en el panel (ofensivo, defensivo, curación…). */
  tags?: string[]
}

/** Objetos equipables del formato, por id canónico (`toId`). */
export type ItemDex = Record<string, ItemData>

/** Descripciones de objeto extraídas del repo de Showdown (`data/text/items.ts`). */
export type ItemText = Record<string, { shortDesc?: string; desc?: string }>

export interface UsageEntry {
  id: string
  name: string
  count: number
  pct: number
}

export interface SetStats {
  moves: { name: string; pct: number }[]
  items: { name: string; pct: number }[]
  abilities: { name: string; pct: number }[]
  natures: { name: string; pct: number }[]
}

export interface Meta {
  format: string
  tournaments: number
  teams: number
  /** ISO de cuándo se agregó el meta (última ejecución de la ingesta de torneos). */
  generatedAt?: string
  /** Origen de los teamlists agregados (p. ej. "limitlesstcg"). */
  source?: string
  usage: UsageEntry[]
  byId: Record<string, SetStats>
}

/** Todo lo que el motor necesita para puntuar un equipo. */
export interface Dataset {
  pokedex: Pokedex
  moves: MoveDex
  meta: Meta
  legal: LegalData
  /** Learnset por especie del roster (opcional: puede no estar generado). */
  learnsets?: Learnsets
  /** Lista canónica de objetos equipables (opcional: puede no estar generada). */
  items?: ItemDex
}

/** Piedra Mega: el objeto que activa la forma (item → forma id Showdown, "absolmegaz"). */
export interface MegaStoneInfo {
  item: string
  forme: string
  /** Nombre visual de la forma, p. ej. "Absol-Mega-Z". */
  formeName: string
}

/** Datos legales del formato Reg M-C (extraídos del motor de cálculo gen 0 = Champions). */
export interface LegalData {
  /** Ids de especie presentes en el roster Champions (formas incluidas). */
  legal: string[]
  /** Megas disponibles por especie base (id Showdown → lista de piedras). */
  megaStones: Record<string, MegaStoneInfo[]>
}
