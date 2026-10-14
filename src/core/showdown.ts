// Import/Export en formato Showdown (adaptado a Champions).
//
// Al exportar se emite `Stat Points:` (SP nativos de Champions; 1 SP = 1 punto a L50).
// Al importar se acepta tanto `Stat Points:`/`SPs:` como `EVs:` (se convierte EV→SP
// dividiendo entre 8). El id de especie se normaliza con `toId`, así que los nombres
// ("Arcanine-Hisui") resuelven contra el pokedex sin guiones.
import { toId } from "./harmony"
import { SP_PER_EV, normalizeSpread } from "./stats"
import { STAT_KEYS } from "./types"
import type { Pokedex, SpeciesData, StatKey, Team, TeamSet } from "./types"

const STAT_LABEL: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" }
const LABEL_STAT: Record<string, StatKey> = {
  hp: "hp", atk: "atk", def: "def", spa: "spa", spd: "spd", spe: "spe",
  attack: "atk", defense: "def", speed: "spe",
  specialattack: "spa", specialdefense: "spd", spattack: "spa", spdefense: "spd",
}

const isGender = (t: string) => /^(M|F|N|\?)$/.test(t.trim())

function splitSpecies(line: string): { name: string; item?: string } {
  const [left, ...rest] = line.split("@")
  const item = rest.join("@").trim() || undefined
  // Quita el marcador de sexo "(M)"/"(F)".
  let name = left.replace(/\((M|F|N|\?)\)\s*$/i, "").trim()
  // "Mote (Especie)" → se queda con la especie entre paréntesis.
  const paren = name.match(/\(([^)]+)\)\s*$/)
  if (paren && !isGender(paren[1])) name = paren[1].trim()
  return { name: name.trim(), item }
}

function parseSpread(value: string): Partial<Record<StatKey, number>> {
  const sp: Partial<Record<StatKey, number>> = {}
  for (const part of value.split("/")) {
    const m = part.trim().match(/^(\d+)\s+(.+)$/)
    if (!m) continue
    const key = LABEL_STAT[toId(m[2])]
    if (key) sp[key] = Number(m[1])
  }
  return sp
}

/** Parsea un pegado estilo Showdown en un equipo. */
export function parseTeam(text: string): Team {
  const team: Team = []
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    if (!/[@]/.test(lines[0]) && !/(Ability|Nature|Level|Stat Points|SPs|EVs):/i.test(lines.join("\n"))) {
      // Bloque sin cabecera reconocible: aun así intentamos por la 1ª línea.
    }
    const { name, item } = splitSpecies(lines[0])
    if (!name) continue
    const set: TeamSet = { id: toId(name), name, item, attacks: [] }
    for (const line of lines.slice(1)) {
      const ability = line.match(/^Ability:\s*(.+)$/i)
      if (ability) { set.ability = ability[1].trim(); continue }
      const nature = line.match(/^([A-Za-z]+)\s+Nature$/i)
      if (nature) { set.nature = capitalize(nature[1]); continue }
      const evs = line.match(/^EVs:\s*(.+)$/i)
      if (evs) { set.sp = scaleSp(parseSpread(evs[1]), SP_PER_EV); continue }
      const sps = line.match(/^(?:Stat Points|SPs):\s*(.+)$/i)
      if (sps) { set.sp = parseSpread(sps[1]); continue }
      if (/^(Level|Shiny|Happiness|IVs|Tera Type|Gigantamax|Hidden Power|Dynamax Level):/i.test(line)) continue
      const move = line.match(/^[-•]\s*(.+)$/) ?? line.match(/^(.+)$/)
      if (move) set.attacks.push(move[1].trim())
    }
    if (Object.keys(set.sp ?? {}).length === 0) set.sp = undefined
    else set.sp = normalizeSpread(set.sp)
    team.push(set)
  }
  return team
}

/** Exporta el equipo en formato Showdown adaptado a Champions. */
export function exportTeam(team: Team, dex?: Pokedex): string {
  return team
    .map((set) => {
      const name = (dex ? nameOf(dex, set.id) : undefined) ?? setName(set)
      const head = set.item ? `${name} @ ${set.item}` : name
      const lines = [head]
      if (set.ability) lines.push(`Ability: ${set.ability}`)
      lines.push("Level: 50")
      if (set.nature) lines.push(`${set.nature} Nature`)
      const spLine = formatSpread(set.sp)
      if (spLine) lines.push(`Stat Points: ${spLine}`)
      for (const mv of set.attacks) lines.push(`- ${mv}`)
      return lines.join("\n")
    })
    .join("\n\n")
}

function setName(set: TeamSet): string {
  return set.name ?? set.id
}

function nameOf(dex: Pokedex, id: string): string | undefined {
  const entry: SpeciesData | undefined = dex[toId(id)] ?? dex[id]
  return entry?.name
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function scaleSp(sp: Partial<Record<StatKey, number>>, divisor: number): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {}
  for (const [k, v] of Object.entries(sp)) out[k as StatKey] = Math.round((v as number) / divisor)
  return out
}

function formatSpread(sp?: TeamSet["sp"]): string | undefined {
  if (!sp) return undefined
  const parts: string[] = []
  for (const key of STAT_KEYS) {
    const v = sp[key]
    if (v) parts.push(`${v} ${STAT_LABEL[key]}`)
  }
  return parts.length ? parts.join(" / ") : undefined
}
