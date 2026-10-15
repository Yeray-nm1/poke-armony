// Construcción del dataset base a partir de los datos de Showdown + el roster
// de Pokémon Champions (gen 0 de @smogon/calc). Server-only: `@smogon/calc` no
// debe entrar en el bundle del cliente.
//
// Lo usa la ingesta en runtime (`src/lib/data.ts` → `getBase`).
import { Generations, toID } from "@smogon/calc"
import type { ItemDex, ItemText, Learnsets, LegalData, MegaStoneInfo, MoveDex, MoveText, Pokedex, StatKey } from "@/core/types"
import { STAT_KEYS } from "@/core/types"
import { getJSON } from "./http"

export const SHOWDOWN = "https://play.pokemonshowdown.com/data"
/**
 * El `moves.json` que sirve Showdown en runtime NO trae descripciones: viven en
 * el repo (`data/text/moves.ts`). Las bajamos y parseamos de ahí.
 */
export const SHOWDOWN_REPO = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master"

type RawLearnset = Record<string, { learnset?: Record<string, string[]> }>

const unquote = (raw: string): string => {
  try {
    return JSON.parse(raw) as string
  } catch {
    return raw.slice(1, -1)
  }
}

/**
 * Extrae `desc`/`shortDesc` de la generación vigente de `data/text/moves.ts`.
 * Parser por líneas apoyado en la indentación del fichero (las entradas de
 * primer nivel van a 1 tabulador y las de la gen actual a 2; los bloques `genN`
 * van a 3), sin `eval` ni compilador de TypeScript.
 */
export function parseMoveText(source: string): MoveText {
  const out: MoveText = {}
  let id: string | null = null
  let entry: { shortDesc?: string; desc?: string } | null = null
  const flush = () => {
    if (id && entry && (entry.shortDesc || entry.desc)) out[id] = entry
  }
  for (const line of source.split("\n")) {
    const top = /^\t"?([a-z0-9]+)"?: \{$/.exec(line)
    if (top) {
      flush()
      id = top[1]
      entry = {}
      continue
    }
    if (!entry) continue
    const field = /^\t\t(desc|shortDesc): (".*"),?\s*$/.exec(line)
    if (!field) continue
    const key = field[1] as "desc" | "shortDesc"
    if (entry[key] === undefined) entry[key] = unquote(field[2])
  }
  flush()
  return out
}

/** Descripciones de movimiento (best-effort: si falla la red, sin descripciones). */
export async function fetchMoveText(): Promise<MoveText> {
  try {
    const res = await fetch(`${SHOWDOWN_REPO}/data/text/moves.ts`)
    if (!res.ok) return {}
    return parseMoveText(await res.text())
  } catch (err) {
    console.warn("[base] no se pudieron traer las descripciones de movimiento:", err)
    return {}
  }
}

/** Fusiona las descripciones sobre los movimientos (por id canónico). */
export function applyMoveText(moves: MoveDex, texts: MoveText): void {
  for (const [id, m] of Object.entries(moves)) {
    const t = texts[id]
    if (!t) continue
    m.shortDesc = t.shortDesc
    m.desc = t.desc
  }
}

/**
 * Etiquetas de efecto de un objeto para el filtro del panel, derivadas de su
 * descripción:
 * - `ofensivo` · potencia el daño (potenciadores de tipo, Life Orb, críticos…);
 * - `defensivo` · mitiga daño o sube defensas (objetos de resistencia, Eviolite…);
 * - `curacion` · recupera PS o cura estados (Leftovers, bayas de curación…);
 * - `velocidad` · actúa sobre la Velocidad o la iniciativa.
 * Un objeto puede llevar varias etiquetas. Devuelve una lista vacía si no
 * reconoce el efecto: el llamante decide el comodín `apoyo`.
 */
export function effectTags(shortDesc?: string): string[] {
  const d = (shortDesc ?? "").toLowerCase()
  const tags = new Set<string>()

  if (
    /halves damage taken|immune to .*attack|survive an attack|lowered stat stages|def(ense)? by 1 stage|sp\. def by 1 stage|sp\. def is 1\.5|def and sp\. def are 1\.5|accuracy of attacks against the holder|attacker loses|grounded, speed halved/.test(
      d,
    )
  ) {
    tags.add("defensivo")
  }
  if (/speed is 1\.5|speed halved|move first/.test(d)) tags.add("velocidad")
  if (/restore|cure|wakes up|heal|gains 1\/8 of the damage|gains 1\.3× hp/.test(d)) tags.add("curacion")
  if (
    /attacks have|attacks do|do 1\.3× damage|super effective|physical attacks have|special attacks have|critical hit|chance to flinch|attack and sp\. atk are doubled|attack is 1\.5|sp\. atk is 1\.5|accuracy of attacks by the holder|damage of moves used|partial-trapping moves deal|first successful/.test(
      d,
    )
  ) {
    tags.add("ofensivo")
  }

  return [...tags]
}

/** Descripciones de objeto (best-effort: si falla la red, sin descripciones). */
export async function fetchItemText(): Promise<ItemText> {
  try {
    const res = await fetch(`${SHOWDOWN_REPO}/data/text/items.ts`)
    if (!res.ok) return {}
    return parseMoveText(await res.text())
  } catch (err) {
    console.warn("[base] no se pudieron traer las descripciones de objeto:", err)
    return {}
  }
}

/** Fusiona las descripciones de objeto y recalcula sus etiquetas de efecto. */
export function applyItemText(items: ItemDex | undefined, texts: ItemText): void {
  for (const [id, item] of Object.entries(items ?? {})) {
    const t = texts[id]
    if (t) {
      item.shortDesc = t.shortDesc
      item.desc = t.desc
    }
    // Conserva las etiquetas de flags (p. ej. `mega`) y añade las de efecto. Solo
    // si no hay ninguna se marca como `apoyo`, para que las piedras Mega no
    // aparezcan también como objetos de apoyo.
    const tags = new Set([...(item.tags ?? []), ...effectTags(item.shortDesc)])
    if (!tags.size) tags.add("apoyo")
    item.tags = [...tags]
  }
}

/** Etiqueta de familia derivada de los flags de `@smogon/calc` (siempre disponible). */
function flagTags(isMega: boolean): string[] {
  return isMega ? ["mega"] : []
}

/**
 * Normaliza las habilidades de una especie a `string[]`. Showdown las guarda
 * como objeto `{0,1,H,S}` y el motor de cálculo igual; aquí las dejamos como
 * lista sin duplicados para poder ofrecerlas como desplegable en el editor.
 */
export function normalizeAbilities(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : []
  const out: string[] = []
  for (const v of values) if (typeof v === "string" && v && !out.includes(v)) out.push(v)
  return out
}

/**
 * Habilidades ocultas de una especie a partir del objeto crudo de Showdown
 * (`{0,1,H,S}`). Devuelve `undefined` si ya viene normalizado a lista (no se
 * puede recuperar la ranura) para no borrar lo que hubiera en una pasada previa.
 */
export function hiddenAbilitiesFrom(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const h = (raw as Record<string, unknown>)["H"]
  return typeof h === "string" && h ? [h] : []
}

/**
 * Fusiona el roster Champions (gen 0 del motor de cálculo) en el pokedex y los
 * movimientos, y genera el pool legal del formato + las piedras Mega disponibles
 * por especie base. No sobreescribe datos propios de Showdown.
 */
function buildChampions(pokedex: Pokedex, moves: MoveDex): LegalData & { items: ItemDex } {
  const gen = Generations.get(0)
  const legal: string[] = []
  const megaStones: Record<string, MegaStoneInfo[]> = {}
  let addedSpecies = 0
  let addedMoves = 0

  for (const s of gen.species) {
    const id = toID(s.name)
    legal.push(id)
    if (!pokedex[id]) {
      const baseStats = {} as Record<StatKey, number>
      for (const k of STAT_KEYS) baseStats[k] = s.baseStats[k] ?? 0
      pokedex[id] = {
        name: s.name,
        types: [...s.types],
        baseStats,
        abilities: normalizeAbilities(s.abilities),
        hiddenAbilities: hiddenAbilitiesFrom(s.abilities),
      }
      addedSpecies++
    }
  }

  for (const mv of gen.moves) {
    const id = toID(mv.name)
    if (!moves[id]) {
      moves[id] = {
        name: mv.name,
        type: mv.type,
        category: mv.category ?? "Status",
        basePower: mv.basePower,
        accuracy: (mv as { accuracy?: number | true }).accuracy,
        target: (mv as { target?: string }).target,
      }
      addedMoves++
    }
  }

  for (const it of gen.items) {
    if (!it.megaStone) continue
    for (const [baseName, formeName] of Object.entries(it.megaStone)) {
      const baseId = toID(baseName)
      if (!legal.includes(baseId)) continue
      ;(megaStones[baseId] ??= []).push({ item: it.name, forme: toID(formeName), formeName })
    }
  }

  console.log(`  · champions: +${addedSpecies} especies y +${addedMoves} movimientos del roster M-C`)
  const items: ItemDex = {}
  for (const it of gen.items) {
    items[toID(it.name)] = { name: it.name, tags: flagTags(!!it.megaStone) }
  }
  return { legal: [...new Set(legal)].sort(), megaStones, items }
}

/**
 * Combina los códigos propios de una especie con los heredados de sus
 * pre-evoluciones quedándose con la generación más alta (la vía vigente). A
 * igualdad de generación mandan los propios: así una evolución no duplica el
 * nivel de aprendizaje de su pre-evolución, pero sí adopta un método de gen más
 * reciente (p. ej. Herencia gen 9 heredada frente a un Transfer gen 8 propio).
 */
function mergeCodes(own: string[] | undefined, inherited: string[]): string[] {
  const genOf = (code: string): number => {
    const m = /^(\d+)/.exec(code)
    return m ? Number(m[1]) : 0
  }
  const all = [...(own ?? []), ...inherited]
  if (!all.length) return []
  const max = Math.max(...all.map(genOf))
  const ownTop = (own ?? []).filter((c) => genOf(c) === max)
  const chosen = ownTop.length ? ownTop : inherited.filter((c) => genOf(c) === max)
  return [...new Set(chosen)].sort()
}

/**
 * Cadena de pre-evoluciones de una especie (ids, de la más cercana a la más
 * lejana). El learnset de una evolución NO incluye los movimientos heredados
 * (típicamente de huevo) de sus pre-evoluciones; el validador de Showdown
 * recorre esta cadena, así que nosotros también.
 */
function prevoChain(id: string, pokedex: Pokedex): string[] {
  const chain: string[] = []
  const seen = new Set<string>([id])
  let cur = (pokedex[id] as { prevo?: string } | undefined)?.prevo
  while (cur) {
    const pid = toID(cur)
    if (seen.has(pid) || !pokedex[pid]) break
    seen.add(pid)
    chain.push(pid)
    cur = (pokedex[pid] as { prevo?: string } | undefined)?.prevo
  }
  return chain
}

/**
 * Learnset por especie del roster: cruza los `learnsets` de Showdown con nuestros
 * movimientos (nos quedamos con los nombres que conocemos y conservamos sus
 * códigos de método de la generación vigente). Une además la cadena de
 * pre-evoluciones (movimientos de huevo y demás herencia). Las formas sin
 * entrada propia (Megas, etc.) heredan la de su especie base.
 */
function buildLearnsets(pokedex: Pokedex, moves: MoveDex, legal: LegalData, raw: RawLearnset): Learnsets {
  const formeToBase = new Map<string, string>()
  for (const [baseId, list] of Object.entries(legal.megaStones)) {
    for (const stone of list) formeToBase.set(stone.forme, baseId)
  }

  const out: Learnsets = {}
  let missing = 0
  for (const id of Object.keys(pokedex)) {
    const base = (pokedex[id] as { baseSpecies?: string } | undefined)?.baseSpecies
    const candidates = [id, base ? toID(base) : undefined, formeToBase.get(id)]
    const entry = candidates.map((c) => (c ? raw[c] : undefined)).find((e) => e?.learnset)
    if (!entry?.learnset) {
      missing++
      continue
    }
    // Movimientos propios de la especie…
    const own: Record<string, string[]> = {}
    for (const [moveId, codes] of Object.entries(entry.learnset)) {
      const name = moves[moveId]?.name
      if (name) own[name] = codes
    }
    // …y heredados de la cadena de pre-evoluciones (sobre todo de huevo).
    const inherited: Record<string, string[]> = {}
    for (const pid of prevoChain(id, pokedex)) {
      const prev = raw[pid]?.learnset
      if (!prev) continue
      for (const [moveId, codes] of Object.entries(prev)) {
        const name = moves[moveId]?.name
        if (name) inherited[name] = [...(inherited[name] ?? []), ...codes]
      }
    }
    const byMove: Record<string, string[]> = {}
    for (const name of new Set([...Object.keys(own), ...Object.keys(inherited)])) {
      const codes = mergeCodes(own[name], inherited[name] ?? [])
      if (codes.length) byMove[name] = codes
    }
    if (Object.keys(byMove).length) out[id] = byMove
  }
  console.log(`  · learnsets: ${Object.keys(out).length}/${Object.keys(pokedex).length} especies (${missing} sin datos)`)
  return out
}

export interface RawDataset {
  pokedex: Pokedex
  moves: MoveDex
  learnsets: RawLearnset
}

export interface BuiltDataset {
  pokedex: Pokedex
  moves: MoveDex
  legal: LegalData
  learnsets: Learnsets
  items: ItemDex
}

/** Fusiona el roster Champions y deriva el pool legal, los objetos y los learnsets. */
export function buildDataset(raw: RawDataset): BuiltDataset {
  const { pokedex, moves } = raw
  const { items, ...legal } = buildChampions(pokedex, moves)
  for (const sp of Object.values(pokedex)) {
    if (!sp.hiddenAbilities) sp.hiddenAbilities = hiddenAbilitiesFrom(sp.abilities)
    sp.abilities = normalizeAbilities(sp.abilities)
  }
  // Sin learnset crudo (ingesta ligera para los route handlers) no hay nada que derivar.
  const learnsets = Object.keys(raw.learnsets ?? {}).length ? buildLearnsets(pokedex, moves, legal, raw.learnsets) : {}
  return { pokedex, moves, legal, learnsets, items }
}

/**
 * Descarga los datos base de Showdown y los construye (ingesta en runtime).
 *
 * `learnsets: false` omite el learnset completo (~2,3 MB de descarga y de salida):
 * lo usan los route handlers, que solo necesitan especies, movimientos, legales y
 * objetos. El selector de movimientos (que sí usa learnsets) vive en la página.
 */
export async function fetchBase(opts: { learnsets?: boolean } = {}): Promise<BuiltDataset> {
  const withLearnsets = opts.learnsets !== false
  const [pokedex, moves, raw, texts, itemTexts] = await Promise.all([
    getJSON<Pokedex>(`${SHOWDOWN}/pokedex.json`),
    getJSON<MoveDex>(`${SHOWDOWN}/moves.json`),
    withLearnsets ? getJSON<RawLearnset>(`${SHOWDOWN}/learnsets.json`) : Promise.resolve({} as RawLearnset),
    fetchMoveText(),
    fetchItemText(),
  ])
  const built = buildDataset({ pokedex, moves, learnsets: raw })
  applyMoveText(built.moves, texts)
  applyItemText(built.items, itemTexts)
  return built
}
