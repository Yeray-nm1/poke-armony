// Recomendador con daño REAL: re-puntúa la armonía con el cierre de amenazas
// calculado por @smogon/calc (misma regla que el panel de amenaza).
import { describe, expect, it } from "vitest"
import { damageClosure } from "./damage"
import { recommendWithDamage } from "./recommend-damage"
import { dex, meta, moves } from "./fixtures"
import type { Team } from "./types"

describe("recomendador con daño real", () => {
  const team: Team = [
    { id: "charizard", attacks: ["Flamethrower", "Protect"], item: "Life Orb" },
    { id: "infernape", attacks: ["Flare Blitz", "Protect"], item: "Life Orb" },
    { id: "incineroar", attacks: ["Flare Blitz", "Protect"], item: "Sitrus Berry", ability: "Intimidate", nature: "Careful" },
  ]

  it("usa el cierre de amenazas real en el análisis base", () => {
    const { analysis } = recommendWithDamage(team, dex, moves, meta)
    const closure = damageClosure(team, dex, meta)
    expect(analysis.metrics.threatClosure).toBeCloseTo(closure.score, 5)
    expect(analysis.unanswered).toEqual(closure.unanswered)
  })

  it("solo deja propuestas que mejoran con daño real, ordenadas por Δ", () => {
    const { proposals } = recommendWithDamage(team, dex, moves, meta)
    expect(proposals.every((p) => p.delta > 0)).toBe(true)
    for (let i = 1; i < proposals.length; i++) {
      expect(proposals[i - 1].delta).toBeGreaterThanOrEqual(proposals[i].delta)
    }
  })

  it("cada propuesta lleva su análisis 'after' coherente con el daño real", () => {
    const { proposals } = recommendWithDamage(team, dex, moves, meta)
    for (const p of proposals) {
      const candidate = team.map((s, i) => (i === p.slot ? p.nextSet : s))
      expect(p.after.metrics.threatClosure).toBeCloseTo(damageClosure(candidate, dex, meta).score, 5)
    }
  })
})
