import { describe, expect, it } from "vitest"
import { MAX_SETS, validateTeam, validateThreatId } from "./validate"

/** Set mínimo válido, con parches. */
const set = (patch: Record<string, unknown> = {}) => ({ id: "pikachu", attacks: [], ...patch })

const error = (raw: unknown): string => {
  const result = validateTeam(raw)
  if (result.ok) throw new Error("se esperaba un error de validación")
  return result.error
}

describe("validación del cuerpo { team }", () => {
  it("acepta un equipo normal (con huecos de movimiento vacíos)", () => {
    const result = validateTeam([
      set({ item: "Light Ball", ability: "Static", nature: "Timid", attacks: ["Thunderbolt", "", ""], sp: { spa: 32, spe: 32 } }),
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual([
        {
          id: "pikachu",
          attacks: ["Thunderbolt", "", ""],
          item: "Light Ball",
          ability: "Static",
          nature: "Timid",
          sp: { spa: 32, spe: 32 },
        },
      ])
    }
  })

  it("devuelve solo los campos del contrato (descarta claves de más)", () => {
    const result = validateTeam([set({ level: 50, evil: { a: 1 } })])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([{ id: "pikachu", attacks: [] }])
  })

  it("acepta un id vacío (el motor trata lo desconocido con elegancia)", () => {
    expect(validateTeam([set({ id: "" })]).ok).toBe(true)
  })

  it("rechaza si el equipo no es un array", () => {
    expect(error("nope")).toBe("se esperaba { team: [...] }")
    expect(error(undefined)).toBe("se esperaba { team: [...] }")
  })

  it("rechaza el equipo vacío", () => {
    expect(error([])).toBe("el equipo está vacío")
  })

  it(`rechaza más de ${MAX_SETS} sets`, () => {
    const many = Array.from({ length: MAX_SETS + 1 }, () => set())
    expect(error(many)).toBe(`el equipo no puede tener más de ${MAX_SETS} Pokémon (recibidos ${MAX_SETS + 1})`)
  })

  it("rechaza un set que no es objeto (antes reventaba el motor con 500)", () => {
    expect(error([42])).toBe("set 1: debe ser un objeto")
    expect(error([null])).toBe("set 1: debe ser un objeto")
    expect(error([[]])).toBe("set 1: debe ser un objeto")
  })

  it("rechaza un set sin id de texto", () => {
    expect(error([{}])).toBe('set 1: falta "id" (texto)')
    expect(error([set({ id: 7 })])).toBe('set 1: falta "id" (texto)')
  })

  it("rechaza un set sin attacks", () => {
    expect(error([{ id: "pikachu" }])).toBe('set 1: falta "attacks" (texto[])')
    expect(error([set({ attacks: "Thunderbolt" })])).toBe('set 1: falta "attacks" (texto[])')
  })

  it("rechaza movimientos que no son texto", () => {
    expect(error([set({ attacks: ["Thunderbolt", 3] })])).toBe("set 1: los movimientos deben ser texto")
  })

  it("rechaza textos del set demasiado largos", () => {
    expect(error([set({ item: "x".repeat(65) })])).toBe('set 1: "item" supera 64 caracteres')
    expect(error([set({ attacks: ["x".repeat(65)] })])).toBe("set 1: un movimiento supera 64 caracteres")
  })

  it("rechaza un reparto de SP que no es objeto", () => {
    expect(error([set({ sp: "32" })])).toBe('set 1: "sp" debe ser un objeto { stat: número }')
    expect(error([set({ sp: [32] })])).toBe('set 1: "sp" debe ser un objeto { stat: número }')
  })

  it("rechaza valores de SP no numéricos o no finitos", () => {
    expect(error([set({ sp: { atk: "32" } })])).toBe('set 1: "sp.atk" debe ser un número finito')
    expect(error([set({ sp: { atk: Number.NaN } })])).toBe('set 1: "sp.atk" debe ser un número finito')
  })

  it("rechaza SP fuera de rango", () => {
    expect(error([set({ sp: { atk: 33 } })])).toBe('set 1: "sp.atk" fuera de rango (0–32)')
    expect(error([set({ sp: { atk: -1 } })])).toBe('set 1: "sp.atk" fuera de rango (0–32)')
  })

  it("rechaza una stat desconocida en sp", () => {
    expect(error([set({ sp: { ataque: 32 } })])).toBe('set 1: stat desconocido en "sp": "ataque"')
  })

  it("señala el set que falla", () => {
    expect(error([set(), set({ id: 7 })])).toBe('set 2: falta "id" (texto)')
  })
})

describe("validación de { threatId }", () => {
  it("acepta un id normal", () => {
    expect(validateThreatId("incineroar")).toEqual({ ok: true, value: "incineroar" })
  })

  it("rechaza lo que no es texto", () => {
    expect(validateThreatId(42)).toEqual({ ok: false, error: "se esperaba { threatId }" })
    expect(validateThreatId(undefined)).toEqual({ ok: false, error: "se esperaba { threatId }" })
  })

  it("rechaza el id vacío o demasiado largo", () => {
    expect(validateThreatId("")).toEqual({ ok: false, error: '"threatId" está vacío' })
    expect(validateThreatId("x".repeat(65)).ok).toBe(false)
  })
})
