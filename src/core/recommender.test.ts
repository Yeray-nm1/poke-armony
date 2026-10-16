import { describe, expect, it } from "vitest"
import { dex, meta, moves } from "./fixtures"
import { groupProposals, proposeEdits, remakeSet, representativeSet } from "./recommender"
import type { Team } from "./types"

describe("recomendador contrafactual", () => {
  const team: Team = [
    { id: "charizard", attacks: ["Flamethrower", "Protect"], item: "Life Orb" },
    { id: "infernape", attacks: ["Flare Blitz", "Protect"], item: "Life Orb" },
    { id: "incineroar", attacks: ["Flare Blitz", "Protect"], item: "Sitrus Berry", ability: "Intimidate", nature: "Careful" },
  ]

  it("representativeSet rellena 4 movimientos con datos del meta", () => {
    const set = representativeSet("incineroar", meta, dex)
    expect(set.attacks).toHaveLength(4)
    expect(set.item).toBeTruthy()
  })

  it("solo propone cambios que mejoran, ordenados por Δ", () => {
    const { proposals } = proposeEdits(team, dex, moves, meta)
    expect(proposals.length).toBeGreaterThan(0)
    expect(proposals.every((p) => p.delta > 0)).toBe(true)
    for (let i = 1; i < proposals.length; i++) {
      expect(proposals[i - 1].delta).toBeGreaterThanOrEqual(proposals[i].delta)
    }
  })

  it("encuentra una sustitución que mejora alguna métrica del cierre", () => {
    const { proposals } = proposeEdits(team, dex, moves, meta)
    const swap = proposals.find((p) => p.kind === "swap" && p.fixes.length > 0)
    expect(swap).toBeTruthy()
  })

  it("agrupa por nivel de invasividad", () => {
    const { proposals } = proposeEdits(team, dex, moves, meta)
    const { tune, remake, swap } = groupProposals(proposals)
    expect(tune.every((p) => p.tier === "tune")).toBe(true)
    expect(remake.every((p) => p.tier === "remake")).toBe(true)
    expect(swap.every((p) => p.tier === "swap")).toBe(true)
  })

  it("② rehacer: misma especie, otro rol (naturaleza/habilidad/item del meta)", () => {
    const st = meta.byId.incineroar
    const current = team[2]
    const alt = remakeSet(current, st)!
    expect(alt).toBeTruthy()
    expect(alt.id).toBe("incineroar")
    expect(alt.nature).not.toBe(current.nature)
    expect(alt.nature).toBe("Adamant")
    expect(alt.ability).toBe("Blaze")
    expect(alt.item).toBe("Assault Vest")
    // Conserva los SP del set del usuario (no hay datos de SP del meta).
    expect(alt.sp).toEqual(current.sp)
  })

  it("② rehacer no aplica sin naturaleza declarada o sin rol alternativo", () => {
    expect(remakeSet({ id: "incineroar", attacks: ["Protect"] }, meta.byId.incineroar)).toBeNull()
    // Especie con un único rol en el meta: no hay "otro set" que proponer.
    expect(remakeSet({ id: "togekiss", nature: "Modest", attacks: ["Moonblast"] }, meta.byId.togekiss)).toBeNull()
  })

  it("el pool legal filtra las sustituciones", () => {
    // Con un pool legal que solo contiene especies ya en el equipo, no hay swaps.
    const { proposals } = proposeEdits(team, dex, moves, meta, { legal: ["charizard", "infernape", "incineroar"] })
    expect(proposals.some((p) => p.kind === "swap")).toBe(false)
  })

  it("incluye la forma Mega como candidata de sustitución", () => {
    const { proposals } = proposeEdits(team, dex, moves, meta, {
      legal: ["charizard", "infernape", "incineroar", "garchomp", "lycanroc", "togekiss", "magnezone"],
      megas: { garchomp: [{ item: "Garchompite", forme: "garchompmega", formeName: "Garchomp-Mega" }] },
    })
    const mega = proposals.find((p) => p.kind === "swap" && p.nextSet.id === "garchompmega")
    expect(mega).toBeTruthy()
    expect(mega!.nextSet.item).toBe("Garchompite")
  })
})
