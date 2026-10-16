import { describe, expect, it } from "vitest"
import { dex, meta, moves } from "./fixtures"
import { teamCompatibility } from "./compatibility"
import type { Team, TeamSet } from "./types"

const mon = (id: string, attacks: string[], extra: Partial<TeamSet> = {}): TeamSet => ({ id, attacks, ...extra })

describe("compatibilidad por parejas", () => {
  it("empareja el clima con quien lo aprovecha, incluido el propio setter", () => {
    const team: Team = [
      mon("charizard", ["Flamethrower", "Protect"], { ability: "Drought" }),
      mon("venusaur", ["Grassy Glide", "Protect"], { ability: "Chlorophyll" }),
    ]
    const r = teamCompatibility(team, dex, moves, meta)
    // Charizard pone sol → Venusaur duplica velocidad (Chlorophyll).
    expect(r.synergies).toContainEqual(expect.objectContaining({ a: 0, b: 1, tag: "clima · sol" }))
    // El propio Charizard aprovecha: su STAB Fuego recibe el sol.
    const self = r.synergies.find((s) => s.a === 0 && s.b === 0)
    expect(self?.detail).toMatch(/STAB/)
  })

  it("señala campos contradictorios (sol frente a lluvia)", () => {
    const team: Team = [
      mon("charizard", ["Flamethrower", "Protect"], { ability: "Drought" }),
      mon("blastoise", ["Surf", "Protect"], { ability: "Drizzle" }),
    ]
    const r = teamCompatibility(team, dex, moves, meta)
    expect(r.conflicts).toContainEqual(expect.objectContaining({ a: 0, b: 1, tag: "clima" }))
  })

  it("marca el fuego amigo de un spread y respeta las inmunidades", () => {
    const hit: Team = [
      mon("garchomp", ["Earthquake", "Protect"]),
      mon("magnezone", ["Thunderbolt", "Protect"]),
    ]
    const note = teamCompatibility(hit, dex, moves, meta).conflicts.find((c) => c.tag === "fuego amigo")
    expect(note).toMatchObject({ a: 0, b: 1 })
    // Magnezone recibe Tierra ×4 (Eléctrico/Acero) → súper efectivo.
    expect(note?.detail).toMatch(/súper efectivo/)

    // Con Levitate, el aliado es inmune: deja de ser un roce.
    const immune: Team = [
      mon("garchomp", ["Earthquake", "Protect"]),
      mon("magnezone", ["Thunderbolt", "Protect"], { ability: "Levitate" }),
    ]
    expect(teamCompatibility(immune, dex, moves, meta).conflicts.some((c) => c.tag === "fuego amigo")).toBe(false)
  })

  it("no cuenta el spread que solo alcanza a los rivales", () => {
    // Rock Slide es `allAdjacentFoes`: no toca al aliado.
    const team: Team = [
      mon("lycanroc", ["Rock Slide", "Protect"]),
      mon("magnezone", ["Thunderbolt", "Protect"]),
    ]
    expect(teamCompatibility(team, dex, moves, meta).conflicts.some((c) => c.tag === "fuego amigo")).toBe(false)
  })

  it("reconoce la cobertura ofensiva entre piezas", () => {
    // Charizard teme Agua/Eléctrico/Roca; Magnezone (Eléctrico) golpea Agua
    // súper eficaz → es la respuesta a lo que amenaza a Charizard.
    const team: Team = [
      mon("charizard", ["Flamethrower", "Protect"]),
      mon("magnezone", ["Thunderbolt", "Protect"]),
    ]
    const cover = teamCompatibility(team, dex, moves, meta).synergies.find((s) => s.tag === "cobertura")
    expect(cover).toMatchObject({ a: 1, b: 0 })
    expect(cover?.detail).toMatch(/Water/)
  })

  it("empareja el seteo con quien lo habilita y Trick Room con los lentos", () => {
    const team: Team = [
      mon("incineroar", ["Fake Out", "Flare Blitz"]),
      mon("garchomp", ["Swords Dance", "Earthquake"]),
    ]
    expect(teamCompatibility(team, dex, moves, meta).synergies).toContainEqual(
      expect.objectContaining({ a: 0, b: 1, tag: "seteo" }),
    )

    const tr: Team = [
      mon("garchomp", ["Trick Room", "Protect"]),
      mon("blastoise", ["Surf", "Protect"]),
    ]
    expect(teamCompatibility(tr, dex, moves, meta).synergies.some((s) => s.tag === "Trick Room" && s.b === 1)).toBe(true)
  })

  it("marca Trick Room contra Tailwind como direcciones opuestas", () => {
    const team: Team = [
      mon("garchomp", ["Trick Room", "Protect"]),
      mon("charizard", ["Tailwind", "Flamethrower"]),
    ]
    expect(teamCompatibility(team, dex, moves, meta).conflicts).toContainEqual(
      expect.objectContaining({ a: 0, b: 1, tag: "velocidad" }),
    )
  })

  it("un equipo vacío no reporta nada", () => {
    expect(teamCompatibility([], dex, moves, meta)).toEqual({ synergies: [], conflicts: [] })
  })
})
