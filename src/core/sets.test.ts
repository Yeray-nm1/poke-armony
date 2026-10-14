import { describe, expect, it } from "vitest"
import { meta as fixtureMeta } from "./fixtures"
import { abilityChoices, abilityOptions, isLegalMove, isMegaStone, itemChoices, learnMethod, legalMoves, megaItemMatches, reconcileSpeciesChange } from "./sets"
import type { LegalData, Meta, TeamSet } from "./types"

const megaStones: LegalData["megaStones"] = {
  garchomp: [{ item: "Garchompite", forme: "garchompmega", formeName: "Garchomp-Mega" }],
  raichu: [
    { item: "Raichunite X", forme: "raichumegax", formeName: "Raichu-Mega-X" },
    { item: "Raichunite Y", forme: "raichumegay", formeName: "Raichu-Mega-Y" },
  ],
}

const set = (patch: Partial<TeamSet>): TeamSet => ({ id: "x", attacks: [], ...patch })
const ctx = (abilities: string[] = []) => ({ abilities, meta: fixtureMeta, megaStones })

describe("habilidades", () => {
  it("lista las habilidades del meta ordenadas por uso", () => {
    expect(abilityOptions("incineroar", fixtureMeta)).toEqual(["Intimidate", "Blaze"])
  })

  it("sin datos de meta devuelve lista vacía", () => {
    expect(abilityOptions("desconocido", fixtureMeta)).toEqual([])
  })

  it("antepone la actual si no figura entre las posibles", () => {
    expect(abilityChoices("Intimidate", ["Intimidate", "Blaze"])).toEqual(["Intimidate", "Blaze"])
    expect(abilityChoices("Rock Head", ["Intimidate", "Blaze"])).toEqual(["Rock Head", "Intimidate", "Blaze"])
    expect(abilityChoices(undefined, ["Intimidate"])).toEqual(["Intimidate"])
  })
})

describe("piedras mega", () => {
  it("detecta si un objeto es una piedra mega", () => {
    expect(isMegaStone("Garchompite", megaStones)).toBe(true)
    expect(isMegaStone("Focus Sash", megaStones)).toBe(false)
    expect(isMegaStone(undefined, megaStones)).toBe(false)
  })

  it("comprueba que la piedra corresponde a la especie (base o mega)", () => {
    expect(megaItemMatches("Garchompite", "garchomp", megaStones)).toBe(true)
    expect(megaItemMatches("Garchompite", "garchompmega", megaStones)).toBe(true)
    expect(megaItemMatches("Garchompite", "raichu", megaStones)).toBe(false)
  })
})

describe("reconciliar al cambiar de especie", () => {
  it("usa las habilidades del pokédex y prefiere la más usada del meta", () => {
    const patch = reconcileSpeciesChange(set({ ability: "Rock Head" }), "incineroar", ctx(["Blaze", "Intimidate"]))
    expect(patch.ability).toBe("Intimidate")
  })

  it("cae a las habilidades del meta si el pokédex no trae ninguna", () => {
    const patch = reconcileSpeciesChange(set({ ability: "Rock Head" }), "incineroar", ctx([]))
    expect(patch.ability).toBe("Intimidate")
  })

  it("conserva la habilidad si está entre las posibles", () => {
    const patch = reconcileSpeciesChange(set({ ability: "Blaze" }), "incineroar", ctx(["Blaze", "Intimidate"]))
    expect("ability" in patch).toBe(false)
  })

  it("limpia la habilidad si no hay datos de la especie", () => {
    const patch = reconcileSpeciesChange(set({ ability: "Rock Head" }), "desconocido", ctx([]))
    expect("ability" in patch).toBe(true)
    expect(patch.ability).toBeUndefined()
  })

  it("retira una piedra mega de otra especie", () => {
    const patch = reconcileSpeciesChange(set({ item: "Garchompite" }), "incineroar", ctx(["Blaze", "Intimidate"]))
    expect("item" in patch).toBe(true)
    expect(patch.item).toBeUndefined()
  })

  it("conserva la piedra si corresponde a la forma mega o a la base", () => {
    expect("item" in reconcileSpeciesChange(set({ item: "Garchompite" }), "garchompmega", ctx())).toBe(false)
    expect("item" in reconcileSpeciesChange(set({ item: "Raichunite Y" }), "raichu", ctx())).toBe(false)
  })

  it("no toca objetos que no son piedras mega", () => {
    const patch = reconcileSpeciesChange(set({ item: "Focus Sash", ability: "Blaze" }), "incineroar", ctx(["Blaze", "Intimidate"]))
    expect("item" in patch).toBe(false)
    expect("ability" in patch).toBe(false)
  })
})

describe("legalidad de movimientos", () => {
  const learnsets = { raichu: { Thunderbolt: ["9M"], "Quick Attack": ["9L1"] } }
  const allMoves = ["Thunderbolt", "Flamethrower", "Quick Attack"]

  it("legalMoves usa el learnset de la especie o, si no hay, todos", () => {
    expect(legalMoves("raichu", learnsets, allMoves)).toEqual(["Quick Attack", "Thunderbolt"])
    expect(legalMoves("desconocido", learnsets, allMoves)).toEqual(allMoves)
    expect(legalMoves("raichu", undefined, allMoves)).toEqual(allMoves)
  })

  it("tolera ids con guion (el meta) además de los canónicos", () => {
    const ls = { arcaninehisui: { "Flare Blitz": ["9M"] } }
    expect(legalMoves("arcanine-hisui", ls, allMoves)).toEqual(["Flare Blitz"])
    expect(isLegalMove("arcanine-hisui", "Flare Blitz", ls)).toBe(true)
  })

  it("isLegalMove valida contra el learnset y no marca cuando no hay datos", () => {
    expect(isLegalMove("raichu", "Thunderbolt", learnsets)).toBe(true)
    expect(isLegalMove("raichu", "Flamethrower", learnsets)).toBe(false)
    expect(isLegalMove("desconocido", "Whatever", learnsets)).toBe(true)
    expect(isLegalMove("raichu", "Whatever", undefined)).toBe(true)
  })
})

describe("métodos de aprendizaje", () => {
  it("elige un único método por prioridad en la generación más alta", () => {
    // Nivel gana aunque también sea MT
    expect(learnMethod(["9M", "9L1", "8M", "7T"])).toBe("Nivel")
    // MT gana sobre Herencia
    expect(learnMethod(["9E", "9M"])).toBe("MT")
    // sin nivel ni MT, cae al siguiente
    expect(learnMethod(["9E"])).toBe("Herencia")
    expect(learnMethod(["9T"])).toBe("Tutor")
    // se ignora la generación antigua
    expect(learnMethod(["7V"])).toBe("Transfer")
    expect(learnMethod([])).toBeUndefined()
    expect(learnMethod(undefined)).toBeUndefined()
  })
})

describe("opciones de objeto", () => {
  const metaItems: Meta = {
    format: "M-C",
    tournaments: 0,
    teams: 0,
    usage: [],
    byId: {
      incineroar: {
        moves: [],
        items: [
          { name: "Assault Vest", pct: 60 },
          { name: "sitrus berry", pct: 30 },
        ],
        abilities: [],
        natures: [],
      },
    },
  }
  const catalog = ["Assault Vest", "Sitrus Berry", "Leftovers", "Focus Sash", "Garchompite", "Raichunite X", "Raichunite Y"]

  it("pone primero los objetos del meta y luego el resto ordenado", () => {
    const { base, mega } = itemChoices("incineroar", catalog, metaItems, megaStones)
    expect(base).toEqual(["Assault Vest", "Sitrus Berry", "Focus Sash", "Leftovers"])
    expect(mega).toEqual([])
  })

  it("canoniza el nombre que usa el meta (mayúsculas del catálogo)", () => {
    const { base } = itemChoices("incineroar", catalog, metaItems, megaStones)
    expect(base).toContain("Sitrus Berry")
    expect(base).not.toContain("sitrus berry")
  })

  it("separa las piedras mega de la especie y descarta las ajenas", () => {
    const { base, mega } = itemChoices("raichu", catalog, metaItems, megaStones)
    expect(mega).toEqual(["Raichunite X", "Raichunite Y"])
    expect(base).toEqual(["Assault Vest", "Focus Sash", "Leftovers", "Sitrus Berry"])
    expect(base).not.toContain("Garchompite")
  })

  it("asocia a cada forma mega su piedra correspondiente", () => {
    expect(itemChoices("raichumegax", catalog, metaItems, megaStones).mega).toEqual(["Raichunite X"])
    expect(itemChoices("raichumegay", catalog, metaItems, megaStones).mega).toEqual(["Raichunite Y"])
  })
})
