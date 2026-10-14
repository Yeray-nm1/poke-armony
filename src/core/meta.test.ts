import { describe, expect, it } from "vitest"
import { aggregateMeta, type MetaTeamSet } from "./meta"

const MON = (id: string, extra: Partial<MetaTeamSet> = {}): MetaTeamSet => ({
  id,
  name: id,
  ...extra,
})

describe("aggregateMeta", () => {
  it("calcula el uso (%) sobre el total de equipos", () => {
    const teams: MetaTeamSet[][] = [
      [MON("garchomp"), MON("incineroar"), MON("rillaboom")],
      [MON("garchomp"), MON("incineroar")],
    ]
    const meta = aggregateMeta(teams, { format: "M-C", tournaments: 1, source: "test" })
    // 2 equipos (no 5 sets): garchomp 2/2 = 100, incineroar 2/2 = 100, rillaboom 1/2 = 50
    expect(meta.teams).toBe(2)
    expect(meta.tournaments).toBe(1)
    expect(meta.usage[0]).toMatchObject({ id: "garchomp", pct: 100 })
    const byId = Object.fromEntries(meta.usage.map((u) => [u.id, u.pct]))
    expect(byId).toEqual({ garchomp: 100, incineroar: 100, rillaboom: 50 })
  })

  it("agrega movimientos, objetos, habilidades y naturalezas por especie (%)", () => {
    const teams: MetaTeamSet[][] = [
      [MON("garchomp", { item: "Choice Band", ability: "Rough Skin", nature: "Jolly", attacks: ["Earthquake", "Dragon Claw"] })],
      [MON("garchomp", { item: "Choice Band", ability: "Sand Veil", nature: "Adamant", attacks: ["Earthquake", "Protect"] })],
    ]
    const s = aggregateMeta(teams, { format: "M-C", tournaments: 1, source: "test" }).byId.garchomp
    expect(s.items[0]).toMatchObject({ name: "Choice Band", pct: 100 })
    const moves = Object.fromEntries(s.moves.map((m) => [m.name, m.pct]))
    expect(moves).toEqual({ Earthquake: 100, "Dragon Claw": 50, Protect: 50 })
    expect(s.abilities.map((a) => a.pct)).toEqual([50, 50])
    expect(s.natures.map((n) => n.pct)).toEqual([50, 50])
  })

  it("ignora sets sin id y respeta generatedAt explícito", () => {
    const meta = aggregateMeta([[MON("pikachu"), { name: "sin id" }]], {
      format: "M-C",
      tournaments: 2,
      source: "limitlesstcg",
      generatedAt: "2026-10-11T00:00:00.000Z",
    })
    expect(meta.usage).toHaveLength(1)
    expect(meta.generatedAt).toBe("2026-10-11T00:00:00.000Z")
    expect(meta.source).toBe("limitlesstcg")
  })

  it("no divide por cero con una lista vacía", () => {
    const meta = aggregateMeta([], { format: "M-C", tournaments: 0, source: "test" })
    expect(meta.teams).toBe(0)
    expect(meta.usage).toEqual([])
    expect(meta.byId).toEqual({})
  })
})
