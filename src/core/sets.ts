// Utilidades de set relacionadas con la especie: reconciliar habilidad y objeto
// cuando el usuario cambia de Pokémon, y validar piedras mega.
import { toId } from "./harmony"
import type { Learnsets, LegalData, Meta, TeamSet } from "./types"

/** Por nombre de piedra mega, el conjunto de especies válidas (forma base y mega). */
function speciesByItem(megaStones: LegalData["megaStones"]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const [baseId, list] of Object.entries(megaStones)) {
    for (const stone of list) {
      const bucket = map.get(stone.item) ?? new Set<string>()
      bucket.add(baseId)
      bucket.add(stone.forme)
      map.set(stone.item, bucket)
    }
  }
  return map
}

/** Habilidades comunes de una especie según el meta (ordenadas por uso). */
export function abilityOptions(id: string, meta: Meta): string[] {
  return (meta.byId[id]?.abilities ?? []).map((a) => a.name)
}

/**
 * Opciones para el desplegable de habilidad: las posibles de la especie y, si la
 * actual no figura (p. ej. un set antiguo), se antepone para no perderla.
 */
export function abilityChoices(current: string | undefined, abilities: string[]): string[] {
  if (current && !abilities.includes(current)) return [current, ...abilities]
  return abilities
}

/** ¿El objeto es una piedra mega de alguna especie? */
export function isMegaStone(item: string | undefined, megaStones: LegalData["megaStones"]): boolean {
  return !!item && speciesByItem(megaStones).has(item)
}

/**
 * Learnset de una especie, tolerando ids con o sin guion (el meta usa slugs
 * `arcanine-hisui` y el pokédex de Showdown ids canónicos `arcaninehisui`).
 */
export function speciesLearnset(id: string, learnsets: Learnsets | undefined): Record<string, string[]> | undefined {
  return learnsets?.[toId(id)] ?? learnsets?.[id]
}

/**
 * Movimientos sugeridos para una especie: su learnset si lo tenemos; si no,
 * la lista completa (para no bloquear a especies sin datos).
 */
export function legalMoves(id: string, learnsets: Learnsets | undefined, allMoves: string[]): string[] {
  const set = speciesLearnset(id, learnsets)
  const names = set ? Object.keys(set) : []
  return names.length ? names.sort() : allMoves
}

/** ¿El movimiento lo puede aprender la especie? Sin datos no se marca como ilegal. */
export function isLegalMove(id: string, move: string, learnsets: Learnsets | undefined): boolean {
  const set = speciesLearnset(id, learnsets)
  if (!set || Object.keys(set).length === 0) return true
  return set[move] !== undefined
}

/** Nombre legible de cada letra de método de Showdown. */
const METHOD_LABEL: Record<string, string> = {
  L: "Nivel",
  M: "MT",
  T: "Tutor",
  E: "Herencia",
  S: "Evento",
  V: "Transfer",
  D: "Dream World",
  R: "Especial",
}

/** Preferencia al mostrar un único método (menor = tiene prioridad). */
const METHOD_PRIORITY: Record<string, number> = { L: 0, M: 1, T: 2, E: 3, S: 4, V: 5, D: 6, R: 7 }

/**
 * Método de aprendizaje de un movimiento, uno solo por prioridad: si se aprende
 * por nivel mostramos "Nivel"; si no, por MT; si no, Tutor; y así hasta Especial
 * (Nivel > MT > Tutor > Herencia > Evento > Transfer > Dream World > Especial).
 * Nos quedamos con la generación más alta presente, que es la vía vigente.
 */
export function learnMethod(codes: string[] | undefined): string | undefined {
  if (!codes?.length) return undefined
  const parsed = codes
    .map((code) => /^(\d+)([A-Z])/.exec(code))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ gen: Number(m[1]), method: m[2] }))
  if (!parsed.length) return undefined
  const gen = Math.max(...parsed.map((p) => p.gen))
  const methods = parsed.filter((p) => p.gen === gen).map((p) => p.method)
  methods.sort((a, b) => (METHOD_PRIORITY[a] ?? 99) - (METHOD_PRIORITY[b] ?? 99))
  const best = methods[0]
  return METHOD_LABEL[best] ?? best
}

/** ¿La piedra mega corresponde a esta especie (su forma base o su forma mega)? */
export function megaItemMatches(item: string, speciesId: string, megaStones: LegalData["megaStones"]): boolean {
  return speciesByItem(megaStones).get(item)?.has(speciesId) ?? false
}

/**
 * Opciones del desplegable de objeto, separadas en dos grupos:
 * - `base`: objetos equipables normales, con los que usa la especie en el meta
 *   primero (por uso) y el resto por orden alfabético;
 * - `mega`: piedras mega que corresponden a esta especie (o a su forma mega).
 */
export function itemChoices(
  id: string,
  items: string[],
  meta: Meta,
  megaStones: LegalData["megaStones"],
): { base: string[]; mega: string[] } {
  const byItem = speciesByItem(megaStones)
  const canon = new Map(items.map((n) => [n.toLowerCase(), n]))
  const top = [...new Set((meta.byId[id]?.items ?? []).map((i) => canon.get(i.name.toLowerCase()) ?? i.name))]

  const mega: string[] = []
  const others: string[] = []
  for (const name of items) {
    const targets = byItem.get(name)
    if (targets) {
      if (targets.has(id)) mega.push(name)
    } else if (!top.includes(name)) {
      others.push(name)
    }
  }
  others.sort()
  const topBase = top.filter((n) => !byItem.has(n))
  return { base: [...topBase, ...others], mega: [...new Set(mega)].sort() }
}

export interface ReconcileContext {
  /** Habilidades posibles de la nueva especie (del pokédex). */
  abilities: string[]
  meta: Meta
  megaStones: LegalData["megaStones"]
}

/**
 * Al cambiar de especie, devuelve los campos a corregir para no arrastrar datos
 * inválidos del Pokémon anterior:
 * - la habilidad se sustituye por la más usada de la nueva especie (o por la
 *   primera de sus habilidades, o se limpia si no hay datos);
 * - la piedra mega se retira si no pertenece a la nueva especie.
 * No toca `id` ni `name` (los fija quien llama).
 */
export function reconcileSpeciesChange(
  set: TeamSet,
  newId: string,
  ctx: ReconcileContext,
): Pick<TeamSet, "ability" | "item"> {
  const patch: Pick<TeamSet, "ability" | "item"> = {}
  const fromMeta = abilityOptions(newId, ctx.meta)
  const possible = ctx.abilities.length ? ctx.abilities : fromMeta
  if (set.ability && !possible.includes(set.ability)) {
    patch.ability = fromMeta.find((a) => possible.includes(a)) ?? possible[0]
  }
  if (set.item && isMegaStone(set.item, ctx.megaStones) && !megaItemMatches(set.item, newId, ctx.megaStones)) {
    patch.item = undefined
  }
  return patch
}
