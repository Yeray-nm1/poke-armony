import { describe, expect, it } from "vitest"
import { dex, meta, moves } from "./fixtures"
import { evaluateThreat } from "./threat"
import type { Team } from "./types"

const team: Team = [
  { id: "charizard", attacks: ["Flamethrower", "Protect"] },
  { id: "blastoise", attacks: ["Surf", "Protect"] },
  { id: "magnezone", attacks: ["Thunderbolt", "Protect"] },
]

describe("evaluateThreat", () => {
  const report = evaluateThreat(team, "incineroar", dex, moves, meta)

  it("describe la amenaza y su uso", () => {
    expect(report.name).toBe("Incineroar")
    expect(report.types).toEqual(["Fire", "Dark"])
    expect(report.usage).toBe(20)
    expect(report.attackTypes).toContain("Fire")
  })

  it("extrae el set más común", () => {
    expect(report.commonSet.ability).toBe("Intimidate")
    expect(report.commonSet.item).toBe("Sitrus Berry")
    expect(report.commonSet.moves).toContain("Flare Blitz")
  })

  it("clasifica a un contra real, un neutral y un débil", () => {
    const byId = Object.fromEntries(report.matchups.map((m) => [m.id, m.verdict]))
    expect(byId.blastoise).toBe("counter") // resiste Fuego y golpea SE con Surf
    expect(byId.charizard).toBe("neutral") // resiste, pero no amenaza
    expect(byId.magnezone).toBe("weak") // Fuego x4
    expect(report.answered).toBe(true)
  })

  it("dice «inmune» cuando el ×0 anula el ataque, no «resiste»", () => {
    // La amenaza usa Tierra; Charizard (Volador) es inmune, no un simple resistente.
    const r = evaluateThreat(team, "garchomp", dex, moves, meta)
    const zard = r.matchups.find((m) => m.id === "charizard")
    expect(zard?.reason).toMatch(/inmune/)
    expect(zard?.reason).not.toMatch(/resiste/)
  })

  it("marca la amenaza como no respondida si nadie es contra", () => {
    const solo: Team = [{ id: "charizard", attacks: ["Flamethrower", "Protect"] }]
    expect(evaluateThreat(solo, "incineroar", dex, moves, meta).answered).toBe(false)
  })
})
