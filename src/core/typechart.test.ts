import { describe, expect, it } from "vitest"
import { eff, effVs } from "./typechart"

describe("tabla de tipos", () => {
  it("aplica súper eficaz, poco eficaz e inmune", () => {
    expect(eff("Fire", "Grass")).toBe(2)
    expect(eff("Fire", "Water")).toBe(0.5)
    expect(eff("Electric", "Ground")).toBe(0)
  })

  it("por defecto es neutro", () => {
    expect(eff("Normal", "Normal")).toBe(1)
    expect(eff("Water", "Psychic")).toBe(1)
  })

  it("combina defensores duales", () => {
    expect(effVs("Ice", ["Dragon", "Flying"])).toBe(4)
    expect(effVs("Electric", ["Water", "Flying"])).toBe(4)
    expect(effVs("Fighting", ["Rock", "Dark"])).toBe(4)
    // Inmune aunque el otro tipo sea débil.
    expect(effVs("Normal", ["Ghost", "Dark"])).toBe(0)
  })
})
