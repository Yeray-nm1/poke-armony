import { describe, expect, it } from "vitest"
import type { ItemDex, MoveDex, Pokedex } from "@/core/types"
import { applyItemText, buildDataset, effectTags, hiddenAbilitiesFrom, parseMoveText } from "./dataset"

/** Muestra con la estructura real de `data/text/moves.ts` (tabuladores). */
const SAMPLE = [
  "export const MovesText: { [id: IDEntry]: MoveText } = {",
  '\t"10000000voltthunderbolt": {',
  '\t\tname: "10,000,000 Volt Thunderbolt",',
  '\t\tdesc: "Has a very high chance for a critical hit.",',
  '\t\tshortDesc: "Very high critical hit ratio.",',
  "\t\tgen7: {",
  '\t\t\tdesc: "descripción antigua que NO debe usarse",',
  '\t\t\tshortDesc: "antigua",',
  "\t\t},",
  "\t},",
  "\twoodhammer: {",
  '\t\tname: "Wood Hammer",',
  '\t\tdesc: "The user takes recoil.",',
  '\t\tshortDesc: "Has 33% recoil.",',
  "\t},",
  "\tonlydesc: {",
  '\t\tname: "Only Desc",',
  '\t\tdesc: "Sin descripción corta.",',
  "\t},",
  "\tescaped: {",
  '\t\tname: "Escaped",',
  '\t\tshortDesc: "He said \\"hi\\".",',
  "\t},",
  "\tempty: {",
  '\t\tname: "Sin descripción",',
  "\t},",
  "};",
].join("\n")

describe("parseMoveText", () => {
  const out = parseMoveText(SAMPLE)

  it("extrae desc y shortDesc de la generación vigente", () => {
    expect(out.woodhammer).toEqual({ desc: "The user takes recoil.", shortDesc: "Has 33% recoil." })
  })

  it("ignora los bloques genN anidados", () => {
    expect(out["10000000voltthunderbolt"]).toEqual({
      desc: "Has a very high chance for a critical hit.",
      shortDesc: "Very high critical hit ratio.",
    })
  })

  it("acepta entradas con solo desc y descarta las vacías", () => {
    expect(out.onlydesc).toEqual({ desc: "Sin descripción corta." })
    expect(out.empty).toBeUndefined()
  })

  it("desescapa las comillas", () => {
    expect(out.escaped).toEqual({ shortDesc: 'He said "hi".' })
  })
})

describe("buildDataset · herencia de pre-evolución", () => {
  const stats = { hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }
  const pokedex = {
    growlithehisui: { name: "Growlithe-Hisui", types: ["Fire"], baseStats: stats, abilities: ["Intimidate"] },
    arcaninehisui: {
      name: "Arcanine-Hisui",
      types: ["Fire"],
      baseStats: stats,
      abilities: ["Intimidate"],
      prevo: "Growlithe-Hisui",
    },
  } as unknown as Pokedex
  const moves = {
    headsmash: { name: "Head Smash", type: "Rock", category: "Physical", basePower: 150 },
    flamethrower: { name: "Flamethrower", type: "Fire", category: "Special", basePower: 90 },
    rockslide: { name: "Rock Slide", type: "Rock", category: "Physical", basePower: 75 },
  } as MoveDex

  it("une los movimientos de la pre-evolución (p. ej. de huevo) a la evolución", () => {
    const built = buildDataset({
      pokedex,
      moves,
      learnsets: {
        growlithehisui: { learnset: { headsmash: ["9E"], flamethrower: ["9L1"] } },
        arcaninehisui: { learnset: { rockslide: ["9M"], flamethrower: ["9L44"] } },
      },
    })
    expect(built.learnsets.arcaninehisui).toEqual({
      "Rock Slide": ["9M"],
      // el movimiento propio manda sobre el heredado (no se añade "9L1")
      Flamethrower: ["9L44"],
      "Head Smash": ["9E"],
    })
    // la pre-evolución no hereda de la evolución
    expect(built.learnsets.growlithehisui).toEqual({ "Head Smash": ["9E"], Flamethrower: ["9L1"] })
  })
})

describe("effectTags", () => {
  it("deriva etiquetas de efecto de la descripción (puede haber varias)", () => {
    expect(effectTags("Sp. Def is 1.5×, but the holder can only use attacking moves.")).toEqual(["defensivo"])
    expect(effectTags("Attacks do 1.3× damage, but the holder loses HP.")).toContain("ofensivo")
    expect(effectTags("Speed is 1.5×.")).toEqual(["velocidad"])
    expect(effectTags("Restores HP.")).toEqual(["curacion"])
  })

  it("devuelve una lista vacía si no reconoce el efecto", () => {
    expect(effectTags("An unrecognised effect.")).toEqual([])
  })
})

describe("applyItemText", () => {
  const items: ItemDex = {
    sitrusberry: { name: "Sitrus Berry", tags: [] },
    charizarditex: { name: "Charizardite X", tags: ["mega"] },
    metronome: { name: "Metronome", tags: [] },
  }

  it("fusiona la descripción y añade la etiqueta de efecto", () => {
    applyItemText(items, { sitrusberry: { shortDesc: "Restores HP." } })
    expect(items.sitrusberry.shortDesc).toBe("Restores HP.")
    expect(items.sitrusberry.tags).toEqual(["curacion"])
  })

  it("conserva la etiqueta de familia y no marca `apoyo` si ya tiene etiqueta (Mega)", () => {
    applyItemText(items, { charizarditex: { shortDesc: "Allows Charizard to Mega Evolve." } })
    expect(items.charizarditex.tags).toEqual(["mega"])
  })

  it("usa `apoyo` cuando no hay ninguna etiqueta", () => {
    applyItemText(items, { metronome: { shortDesc: "An unrecognised effect." } })
    expect(items.metronome.tags).toEqual(["apoyo"])
  })

  it("no falla sin catálogo (items undefined)", () => {
    expect(() => applyItemText(undefined, {})).not.toThrow()
  })
})

describe("hiddenAbilitiesFrom", () => {
  it("extrae la ranura H del objeto crudo de Showdown", () => {
    expect(hiddenAbilitiesFrom({ 0: "Intimidate", 1: "Flash Fire", H: "Justified" })).toEqual(["Justified"])
  })

  it("devuelve undefined si ya viene normalizado (no borra pasadas previas)", () => {
    expect(hiddenAbilitiesFrom(["Intimidate", "Flash Fire"])).toBeUndefined()
  })
})
