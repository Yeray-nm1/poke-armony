import { describe, expect, it } from "vitest"
import { clampSp, isValidSpread, maxSpAllowed, natureEffect, normalizeSpread, spUsed, statAt50, suggestSpread } from "./stats"
import type { MoveDex, SpeciesData, StatKey, TeamSet } from "./types"

describe("stats a L50 (1 SP = 1 punto)", () => {
  it("Garchomp (spe base 102) Jolly con 32 SP llega a 169", () => {
    expect(statAt50(102, 32, "spe", "Jolly")).toBe(169)
  })

  it("Garchomp (hp base 108) sin SP tiene 183 PS", () => {
    expect(statAt50(108, 0, "hp", undefined)).toBe(183)
  })

  it("una naturaleza neutra no altera el stat", () => {
    expect(statAt50(100, 32, "atk", "Serious")).toBe(statAt50(100, 32, "atk", undefined))
  })

  it("la naturaleza sube ~10% y baja ~10%", () => {
    const neutral = statAt50(100, 0, "atk", undefined)
    expect(statAt50(100, 0, "atk", "Adamant")).toBe(Math.floor(neutral * 1.1))
    expect(statAt50(100, 0, "atk", "Modest")).toBe(Math.floor(neutral * 0.9))
  })
})

describe("validación del reparto de SP", () => {
  const t = (sp: TeamSet["sp"]): TeamSet => ({ id: "x", attacks: [], sp })

  it("acepta un reparto legal (<=32 por stat y <=66 total)", () => {
    expect(isValidSpread(t({ spa: 32, spe: 32, hp: 2 })).ok).toBe(true)
    expect(spUsed(t({ spa: 32, spe: 32, hp: 2 }))).toBe(66)
  })

  it("rechaza pasarse de 32 en un stat", () => {
    expect(isValidSpread(t({ atk: 33 })).ok).toBe(false)
  })

  it("rechaza pasarse de 66 en total", () => {
    expect(isValidSpread(t({ atk: 32, def: 32, spd: 3 })).ok).toBe(false)
  })
})

describe("recorte de SP al editar (máx 32/stat y 66 en total)", () => {
  const t = (sp: TeamSet["sp"]): TeamSet => ({ id: "x", attacks: [], sp })

  it("maxSpAllowed respeta el presupuesto de 66 y el techo de 32", () => {
    expect(maxSpAllowed(t({ spa: 32, spe: 2 }), "hp")).toBe(32)
    expect(maxSpAllowed(t({ spa: 32, spe: 30 }), "hp")).toBe(4)
    expect(maxSpAllowed(t({ spa: 32, spe: 32, hp: 2 }), "atk")).toBe(0)
  })

  it("clampSp acota a [0,32], redondea y no deja pasar de 66", () => {
    expect(clampSp(t({}), "atk", 40)).toBe(32)
    expect(clampSp(t({}), "atk", -5)).toBe(0)
    expect(clampSp(t({}), "atk", 12.6)).toBe(13)
    expect(clampSp(t({ spa: 32, spe: 32 }), "hp", 10)).toBe(2)
    expect(clampSp(t({}), "atk", Number.NaN)).toBe(0)
  })

  it("repartir con clampSp produce siempre un set legal", () => {
    let sp: TeamSet["sp"] = {}
    const keys: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"]
    for (const k of keys) sp = { ...sp, [k]: clampSp(t(sp), k, 99) }
    const set = t(sp)
    expect(isValidSpread(set).ok).toBe(true)
    expect(spUsed(set)).toBe(66)
  })
})

describe("normalizar reparto al importar", () => {
  it("acota cada stat a 32", () => {
    expect(normalizeSpread({ atk: 99 })).toEqual({ atk: 32 })
  })

  it("recorta el exceso repartiendo entre las stats más altas", () => {
    expect(normalizeSpread({ atk: 32, def: 32, hp: 10 })).toEqual({ hp: 10, atk: 28, def: 28 })
  })

  it("deja intacto un reparto ya legal", () => {
    expect(normalizeSpread({ spa: 32, spe: 32, hp: 2 })).toEqual({ hp: 2, spa: 32, spe: 32 })
  })

  it("redondea, descarta no positivos y trata NaN como 0", () => {
    expect(normalizeSpread({ hp: 12.4, atk: -3, def: Number.NaN })).toEqual({ hp: 12 })
  })
})

describe("reparto sugerido (solo a petición, nunca automático)", () => {
  const spec = (base?: Partial<SpeciesData["baseStats"]>): SpeciesData => ({
    types: ["Normal"],
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100, ...base },
  })
  const MOVES: MoveDex = {
    earthquake: { type: "Ground", category: "Physical", basePower: 100 },
    rockslide: { type: "Rock", category: "Physical", basePower: 75 },
    flamethrower: { type: "Fire", category: "Special", basePower: 90 },
    heatwave: { type: "Fire", category: "Special", basePower: 95 },
    protect: { type: "Normal", category: "Status", basePower: 0 },
    willowisp: { type: "Fire", category: "Status", basePower: 0 },
    swordsdance: { type: "Normal", category: "Status", basePower: 0 },
    trickroom: { type: "Psychic", category: "Status", basePower: 0 },
  }
  const set = (attacks: string[], nature?: string): TeamSet => ({ id: "x", attacks, nature })

  it("atacante rápido: la categoría con más potencia manda (físico → Atq)", () => {
    const sp = suggestSpread(spec(), set(["Earthquake", "Rock Slide", "Protect", "Swords Dance"]), MOVES)
    expect(sp).toEqual({ atk: 32, spe: 32, hp: 2 })
    expect(isValidSpread({ id: "x", attacks: [], sp }).ok).toBe(true)
    expect(spUsed({ id: "x", attacks: [], sp })).toBe(66)
  })

  it("la potencia de los movimientos manda sobre la naturaleza", () => {
    // Adamant sube Atq, pero todos los movimientos elegidos son especiales.
    const sp = suggestSpread(spec(), set(["Flamethrower", "Heat Wave", "Protect", "Will-O-Wisp"], "Adamant"), MOVES)
    expect(sp).toEqual({ spa: 32, spe: 32, hp: 2 })
  })

  it("fallback sin dex de movimientos: manda la base (y el set vacío también)", () => {
    const physical = spec({ atk: 130, spa: 80 })
    expect(suggestSpread(physical, set(["Earthquake"], undefined), undefined)).toEqual({ atk: 32, spe: 32, hp: 2 })
    expect(suggestSpread(physical, set([]), MOVES)).toEqual({ atk: 32, spe: 32, hp: 2 })
  })

  it("Trick Room en el set → atacante lento, sin velocidad", () => {
    const sp = suggestSpread(spec(), set(["Flamethrower", "Heat Wave", "Protect", "Trick Room"]), MOVES)
    expect(sp).toEqual({ spa: 32, hp: 32, def: 2 })
    expect(sp.spe).toBeUndefined()
  })

  it("naturaleza que resta velocidad (Quiet) → lento aunque no lleve TR", () => {
    const sp = suggestSpread(spec(), set(["Flamethrower", "Protect"], "Quiet"), MOVES)
    expect(sp).toEqual({ spa: 32, hp: 32, def: 2 })
  })

  it("solo movimientos de estado → apoyo rápido (PS + velocidad)", () => {
    const sp = suggestSpread(spec(), set(["Protect", "Will-O-Wisp", "Swords Dance"]), MOVES)
    expect(sp).toEqual({ hp: 32, spe: 32, def: 2 })
  })

  it("apoyo lento (TR) → PS + doble defensa y 2 a la otra", () => {
    const sp = suggestSpread(spec(), set(["Protect", "Will-O-Wisp", "Trick Room"]), MOVES)
    expect(sp).toEqual({ hp: 32, def: 32, spd: 2 })
  })

  it("la mejor defensa la elige la naturaleza si sube una", () => {
    const sp = suggestSpread(spec(), set(["Protect", "Will-O-Wisp"], "Calm"), MOVES)
    expect(sp).toEqual({ hp: 32, spe: 32, spd: 2 })
  })

  it("cualquier combinación produce un reparto legal de 66 SP", () => {
    const sets = [
      set(["Earthquake", "Rock Slide", "Protect", "Swords Dance"]),
      set(["Flamethrower", "Heat Wave", "Protect", "Trick Room"]),
      set(["Protect", "Will-O-Wisp", "Swords Dance"]),
      set(["Protect", "Will-O-Wisp", "Trick Room"], "Sassy"),
      set([]),
      set(["Earthquake"], "Jolly"),
    ]
    for (const s of sets) {
      const full: TeamSet = { ...s, sp: suggestSpread(spec({ def: 60, spd: 140 }), s, MOVES) }
      expect(isValidSpread(full).ok).toBe(true)
      expect(spUsed(full)).toBe(66)
    }
  })
})

describe("efecto de la naturaleza", () => {
  it("marca como neutras las neutras y el vacío", () => {
    expect(natureEffect("Serious").neutral).toBe(true)
    expect(natureEffect(undefined).neutral).toBe(true)
    expect(natureEffect("").neutral).toBe(true)
  })

  it("devuelve el stat que sube y el que baja", () => {
    expect(natureEffect("Adamant")).toEqual({ neutral: false, plus: "atk", minus: "spa" })
    expect(natureEffect("Jolly")).toEqual({ neutral: false, plus: "spe", minus: "spa" })
    expect(natureEffect("Bold")).toEqual({ neutral: false, plus: "def", minus: "atk" })
  })
})
