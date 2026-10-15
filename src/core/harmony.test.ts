import { describe, expect, it } from "vitest"
import { dex, meta, moves } from "./fixtures"
import {
  analyze, defensiveBalance, offensiveCoverage, redundancy, roleCoverage, speciesOf, speedProfile, synergy, threatClosure,
} from "./harmony"
import type { Meta, Pokedex, Team, TeamSet } from "./types"

const mon = (id: string, attacks: string[], extra: Partial<TeamSet> = {}): TeamSet => ({ id, attacks, ...extra })

// Todo Fuego: debilidades apiladas a Agua/Tierra/Roca.
const fireTeam: Team = [
  mon("charizard", ["Flamethrower", "Protect"]),
  mon("infernape", ["Flare Blitz", "Close Combat"]),
  mon("incineroar", ["Flare Blitz", "Protect"]),
]

const balancedTeam: Team = [
  mon("garchomp", ["Earthquake", "Protect"]),
  mon("magnezone", ["Thunderbolt", "Protect"]),
  mon("togekiss", ["Moonblast", "Protect"]),
  mon("blastoise", ["Surf", "Protect"]),
  mon("venusaur", ["Grassy Glide", "Protect"]),
  mon("infernape", ["Close Combat", "Protect"]),
]

describe("equilibrio defensivo", () => {
  it("detecta una debilidad apilada sin resistencia", () => {
    const d = defensiveBalance(fireTeam, dex)
    expect(d.breakdown.find((b) => b.type === "Water")).toMatchObject({ weak: 3, resist: 0 })
    const naked = d.breakdown.filter((b) => b.weak >= 2 && b.resist === 0).map((b) => b.type)
    expect(naked).toContain("Water")
    expect(d.score).toBeLessThan(0.5)
  })

  it("un equipo equilibrado defiende mejor que el mono-Fuego", () => {
    expect(defensiveBalance(balancedTeam, dex).score).toBeGreaterThan(defensiveBalance(fireTeam, dex).score)
  })
})

describe("cobertura ofensiva", () => {
  it("señala huecos frente al meta", () => {
    const o = offensiveCoverage(fireTeam, dex, moves, meta)
    expect(o.gaps.length).toBeGreaterThan(0)
  })
})

describe("cobertura de tipos", () => {
  it("expone los 18 tipos con sus conteos defensivos", () => {
    const a = analyze(balancedTeam, dex, moves, meta)
    expect(a.typeCoverage).toHaveLength(18)
    // Magnezone (Steel) resiste Agua.
    const water = a.typeCoverage.find((c) => c.type === "Water")!
    expect(water.resist).toBeGreaterThanOrEqual(1)
    expect(typeof water.weak).toBe("number")
  })

  it("marca el mono-Fuego con Agua apilada sin resistir", () => {
    const water = analyze(fireTeam, dex, moves, meta).typeCoverage.find((c) => c.type === "Water")!
    expect(water.weak).toBeGreaterThanOrEqual(3)
    expect(water.resist).toBe(0)
  })
})

describe("cierre de amenazas", () => {
  it("cuenta a un contra real (resiste y golpea SE)", () => {
    const team: Team = [mon("blastoise", ["Surf", "Protect"])]
    const r = threatClosure(team, dex, moves, meta)
    expect(r.unanswered).not.toContain("incineroar") // Surf golpea SE a Fuego/Siniestro
    expect(r.score).toBeGreaterThan(0)
  })

  it("no considera contra a quien no amenaza", () => {
    const team: Team = [mon("charizard", ["Flamethrower", "Protect"])]
    expect(threatClosure(team, dex, moves, meta).unanswered).toContain("incineroar")
  })
})

describe("roles y sinergia", () => {
  it("detecta Protect y la ausencia de redirección", () => {
    const r = roleCoverage(balancedTeam)
    expect(r.present).toContain("protect")
    expect(r.missing).toContain("redirection")
  })

  it("el control de velocidad no puntúa como rol, pero se reporta", () => {
    const r = roleCoverage([mon("charizard", ["Tailwind", "Protect"])])
    expect(r.missing).not.toContain("speed-control")
    expect(r.speedControl).toBe(true)
    expect(roleCoverage(balancedTeam).speedControl).toBe(false)
  })

  it("suma sinergia de terreno + abusador", () => {
    const team: Team = [mon("venusaur", ["Grassy Glide", "Protect"], { ability: "Grassy Surge" })]
    expect(synergy(team).hits).toBeGreaterThanOrEqual(1)
    expect(synergy([mon("charizard", ["Flamethrower", "Protect"])]).hits).toBe(0)
  })
})

describe("redundancia", () => {
  it("penaliza items y tipos primarios duplicados", () => {
    const team: Team = [mon("charizard", ["Flamethrower"], { item: "Life Orb" }), mon("infernape", ["Flare Blitz"], { item: "Life Orb" })]
    expect(redundancy(team, dex)).toBeGreaterThan(0)
  })
})

// Fixtures propios de velocidad: mismo stat base (80) con naturalezas/objetos
// distintos, para aislar la inferencia de SP y el Choice Scarf de la oposición.
const spe80 = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 }
const fastDex: Pokedex = {
  ...dex,
  me: { name: "Me", types: ["Normal"], baseStats: { ...spe80, spe: 100 } },
  slowmon: { name: "Slowmon", types: ["Normal"], baseStats: spe80 },
  fastmon: { name: "Fastmon", types: ["Normal"], baseStats: spe80 },
  scarfmon: { name: "Scarfmon", types: ["Normal"], baseStats: spe80 },
}
const fastMeta: Meta = {
  format: "M-C",
  tournaments: 1,
  teams: 1,
  source: "test",
  usage: [
    { id: "slowmon", name: "Slowmon", count: 50, pct: 50 },
    { id: "scarfmon", name: "Scarfmon", count: 50, pct: 50 },
    { id: "fastmon", name: "Fastmon", count: 50, pct: 50 },
  ],
  byId: {
    slowmon: { moves: [], items: [], abilities: [], natures: [{ name: "Brave", pct: 100 }] },
    scarfmon: { moves: [], items: [{ name: "Choice Scarf", pct: 100 }], abilities: [], natures: [{ name: "Brave", pct: 100 }] },
    fastmon: { moves: [], items: [], abilities: [], natures: [{ name: "Timid", pct: 100 }] },
  },
}

describe("perfil de velocidad con SP reales", () => {
  it("usa los SP y la naturaleza del usuario para la velocidad a L50", () => {
    const invested: Team = [mon("charizard", ["Flamethrower"], { sp: { spe: 32 }, nature: "Timid" })]
    const plain: Team = [mon("charizard", ["Flamethrower"])]
    const a = speedProfile(invested, dex, meta)
    const b = speedProfile(plain, dex, meta)
    // 100 base + 32 SP + Timid = 167; sin inversión = 120.
    expect(a.teamSpeeds).toEqual([167])
    expect(b.teamSpeeds).toEqual([120])
    expect(a.fastest).toBeGreaterThan(b.fastest)
  })

  it("la inversión en velocidad cambia la puntuación frente al meta", () => {
    const slow: Team = [mon("blastoise", ["Surf"])]
    const fast: Team = [mon("charizard", ["Flamethrower"], { sp: { spe: 32 }, nature: "Timid" })]
    const s1 = speedProfile(slow, dex, meta)
    const s2 = speedProfile(fast, dex, meta)
    expect(s1.fastest).toBeLessThan(s2.fastest)
    expect(s1.scenarios.none).toBeLessThan(s2.scenarios.none)
  })

  it("precalcula los 3 escenarios de campo y detecta el control del equipo", () => {
    const team: Team = [mon("charizard", ["Flamethrower", "Tailwind", "Trick Room"], { sp: { spe: 32 }, nature: "Timid" })]
    const s = speedProfile(team, dex, meta)
    expect(s.hasTailwind).toBe(true)
    expect(s.hasTrickRoom).toBe(true)
    // Tailwind solo puede mejorar la carrera (te duplica la velocidad).
    expect(s.scenarios.tailwind).toBeGreaterThanOrEqual(s.scenarios.none)
    expect(speedProfile([mon("charizard", ["Flamethrower"])], dex, meta)).toMatchObject({ hasTailwind: false, hasTrickRoom: false })
  })

  it("bajo Trick Room el equipo lento puntúa más que el rápido", () => {
    const slow: Team = [mon("blastoise", ["Surf"])]
    const fast: Team = [mon("charizard", ["Flamethrower"], { sp: { spe: 32 }, nature: "Timid" })]
    const s1 = speedProfile(slow, dex, meta)
    const s2 = speedProfile(fast, dex, meta)
    expect(s1.scenarios.trickroom).toBeGreaterThan(s2.scenarios.trickroom)
  })

  it("mide por fracción del equipo: cuántos de tus miembros superan a cada amenaza", () => {
    // Amenaza de velocidad intermedia (109) para que solo uno de los dos miembros
    // la supere: así se ve que el crédito es fraccionario (N de N) y que un solo
    // miembro lento no hunde la métrica.
    const dex2: Pokedex = {
      ...fastDex,
      midmon: { name: "Midmon", types: ["Normal"], baseStats: { ...spe80, spe: 89 } },
    }
    const meta2: Meta = {
      ...fastMeta,
      usage: [...fastMeta.usage, { id: "midmon", name: "Midmon", count: 50, pct: 50 }],
      byId: { ...fastMeta.byId, midmon: { moves: [], items: [], abilities: [], natures: [{ name: "Hardy", pct: 100 }] } },
    }
    const team: Team = [mon("me", ["Protect"]), mon("slowmon", ["Protect"])] // 120 y 100
    const s = speedProfile(team, dex2, meta2)
    const beats = (id: string) => s.threats.find((t) => t.id === id)!.beats.none

    // Banda del equipo (contexto que muestra la UI).
    expect(s.teamSize).toBe(2)
    expect(s.slowest).toBe(100)
    expect(s.fastest).toBe(120)
    expect(s.median).toBe(110)

    // Desglose: 90 la superan los dos; 109 solo el rápido; 135 y 145 ninguno.
    expect(beats("slowmon")).toBe(2)
    expect(beats("midmon")).toBe(1)
    expect(beats("scarfmon")).toBe(0)
    expect(beats("fastmon")).toBe(0)

    // Métrica = media de fracciones ponderada por uso: (1×50 + 0,5×50 + 0 + 0) / 200.
    expect(s.scenarios.none).toBeCloseTo(75 / 200, 5)
    // Tailwind ×2: los dos superan a todas ⇒ 1.
    expect(s.scenarios.tailwind).toBeCloseTo(1, 5)
    // Trick Room (invertido): (0 + 0,5 + 1 + 1) × 50 / 200.
    expect(s.scenarios.trickroom).toBeCloseTo(125 / 200, 5)

    // Desglose por pieza (el plegable de la UI), de más rápida a más lenta.
    expect(s.members.map((m) => m.id)).toEqual(["me", "slowmon"])
    expect(s.members[0].coverage.none).toBeCloseTo(100 / 200, 5) // 120: adelanta a 90 y 109
    expect(s.members[1].coverage.none).toBeCloseTo(50 / 200, 5) // 100: solo a 90
    // Sin `sp` en el set ⇒ marcada como no invertida.
    expect(s.members.every((m) => !m.invested)).toBe(true)
  })

  it("infiere los SP de la oposición de su naturaleza y aplica Choice Scarf", () => {
    // Miembro a 120 de velocidad (base 100 sin inversión).
    const team: Team = [mon("me", ["Protect"])]
    const s = speedProfile(team, fastDex, fastMeta)
    // slowmon: Brave ⇒ 0 SP ⇒ 90 (< 120 ⇒ ganas).
    // scarfmon: Brave + Choice Scarf ⇒ 90×1.5 = 135 (> 120 ⇒ pierdes).
    // fastmon: Timid ⇒ 32 SP + ×1.1 = 145 (> 120 ⇒ pierdes).
    expect(s.scenarios.none).toBeCloseTo(50 / 150, 5)
  })
})

describe("resolución de ids (con/sin guion)", () => {
  it("encuentra especies con id de Limitless (con guion) en el pokedex de Showdown", () => {
    expect(speciesOf(dex, "arcanine-hisui")?.name).toBe("Arcanine-Hisui")
  })

  it("cuenta sus tipos en el análisis", () => {
    const team: Team = [mon("arcanine-hisui", [])]
    const d = defensiveBalance(team, dex)
    // Fuego/Roca: débil a Agua (x4).
    expect(d.breakdown.find((b) => b.type === "Water")).toMatchObject({ weak: 1 })
  })
})

describe("armonía compuesta", () => {
  it("el equipo equilibrado armoniza más que el mono-Fuego", () => {
    expect(analyze(balancedTeam, dex, moves, meta).harmony).toBeGreaterThan(analyze(fireTeam, dex, moves, meta).harmony)
  })

  it("todas las métricas y la armonía caen en rango", () => {
    for (const t of [balancedTeam, fireTeam]) {
      const a = analyze(t, dex, moves, meta)
      for (const [k, v] of Object.entries(a.metrics)) expect(v, k).toBeGreaterThanOrEqual(0)
      for (const [k, v] of Object.entries(a.metrics)) expect(v, k).toBeLessThanOrEqual(1)
      expect(a.harmony).toBeGreaterThanOrEqual(0)
      expect(a.harmony).toBeLessThanOrEqual(100)
      expect(a.weakest).toHaveLength(3)
      // La métrica base de velocidad es la del escenario sin control.
      expect(a.speedScenarios.none).toBe(a.metrics.speed)
      for (const v of Object.values(a.speedScenarios)) expect(v).toBeGreaterThanOrEqual(0)
      for (const v of Object.values(a.speedScenarios)) expect(v).toBeLessThanOrEqual(1)
    }
  })
})
