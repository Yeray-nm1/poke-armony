import { describe, expect, it } from "vitest"
import { dex, meta, moves } from "./fixtures"
import {
  analyze, defensiveBalance, offensiveCoverage, redundancy, roleCoverage, speciesOf, speedProfile, synergy, threatClosure,
} from "./harmony"
import type { Team, TeamSet } from "./types"

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
    expect(s1.score).toBeLessThan(s2.score)
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
    }
  })
})
