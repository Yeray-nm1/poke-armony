import { describe, expect, it } from "vitest"
import { dex, meta, moves } from "./fixtures"
import {
  aguanteMeta, analyze, archetypeCoverage, defensiveBalance, offensiveCoverage, pieceRoles, redundancy, roleFocus, speciesOf, speedProfile, threatClosure,
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

describe("roles", () => {
  it("deduce funciones por pieza (Protect no es rol: es ruido)", () => {
    const incin = pieceRoles(mon("incineroar", ["Flare Blitz", "Fake Out"], { ability: "Intimidate" }), moves)
    expect(incin).toEqual(expect.arrayContaining(["fakeOut", "statDrop"]))
    expect(pieceRoles(mon("charizard", ["Flamethrower", "Protect"]), moves)).toEqual([])
  })

  it("declara Tailwind como plan y cae a balance cuando no hay foco", () => {
    const tw = roleFocus([mon("charizard", ["Tailwind", "Protect"])], dex, moves, meta)
    expect(tw.plans.map((p) => p.id)).toContain("tailwind")
    expect(roleFocus(balancedTeam, dex, moves, meta).plans.map((p) => p.id)).toEqual(["balance"])
  })

  it("el control de velocidad se reporta pero no puntúa", () => {
    const ctrl = roleFocus([mon("charizard", ["Thunder Wave", "Protect"])], dex, moves, meta)
    const plain = roleFocus([mon("charizard", ["Flamethrower", "Protect"])], dex, moves, meta)
    expect(ctrl.speedControl).toBe(true)
    expect(plain.speedControl).toBe(false)
    // La nota solo sale de las comprobaciones del plan declarado: añadir
    // control de velocidad no la mueve (eso lo puntúa Velocidad).
    expect(ctrl.score).toBe(plain.score)
  })

  it("un equipo lento sostiene mejor el Trick Room que uno rápido", () => {
    // Un equipo de TR real baja velocidad (naturaleza Quiet): así los lentos
    // salen por delante de casi toda la amenaza. El rápido declara el plan sin
    // poder sostenerlo, que es justo lo que la métrica debe distinguir.
    const slow = roleFocus(
      [
        mon("incineroar", ["Trick Room", "Fake Out"], { nature: "Quiet" }),
        mon("magnezone", ["Thunderbolt", "Protect"], { nature: "Quiet" }),
        mon("blastoise", ["Surf", "Protect"], { nature: "Quiet" }),
      ],
      dex, moves, meta,
    )
    const fast = roleFocus(
      [
        mon("garchomp", ["Trick Room", "Protect"], { nature: "Jolly" }),
        mon("infernape", ["Fake Out", "Close Combat"], { nature: "Jolly" }),
        mon("charizard", ["Flamethrower", "Protect"], { nature: "Timid" }),
      ],
      dex, moves, meta,
    )
    expect(slow.plans.map((p) => p.id)).toContain("trickroom")
    expect(fast.plans.map((p) => p.id)).toContain("trickroom")
    expect(slow.score).toBeGreaterThan(fast.score)
  })

  it("el ritmo rápido se sostiene si las piezas alcanzan la meta con el alivio", () => {
    // Equipo lento sin cubrir el meta por sí solo: con Tailwind todas llegan.
    const tw = roleFocus(
      [
        mon("infernape", ["Tailwind", "Fake Out"]),
        mon("blastoise", ["Surf", "Protect"]),
        mon("venusaur", ["Grassy Glide", "Protect"]),
      ],
      dex, moves, meta,
    )
    expect(tw.plans.map((p) => p.id)).toEqual(["tailwind"])
    expect(tw.score).toBe(1)
  })
})

describe("aguante vs. el meta", () => {
  it("un equipo con respuestas defensivas aguanta más meta que el mono-Fuego", () => {
    expect(aguanteMeta(balancedTeam, dex, moves, meta).score)
      .toBeGreaterThan(aguanteMeta(fireTeam, dex, moves, meta).score)
  })

  it("basta una respuesta por amenaza: no exige que casi todo el equipo aguante", () => {
    // Un solo muro (Blastoise resiste Fuego) ya cubre esa amenaza…
    const oneWall = aguanteMeta([mon("blastoise", ["Surf"])], dex, moves, meta).score
    expect(oneWall).toBeGreaterThan(0)
    // …y el equipo con respuestas a cada amenaza cubre prácticamente todo el meta.
    expect(aguanteMeta(balancedTeam, dex, moves, meta).score).toBeGreaterThan(0.9)
  })
})

describe("cobertura de arquetipos", () => {
  it("no puntúa planes que el meta no juega", () => {
    // Los fixtures no traen Trick Room, Tailwind, clima ni seteo.
    expect(archetypeCoverage(balancedTeam, dex, meta)).toEqual({ score: 0, archetypes: [] })
  })

  it("detecta el clima que manda y comprueba que puedas negarlo", () => {
    const rain: Meta = {
      format: "M-C", tournaments: 1, teams: 1, source: "test",
      usage: [
        { id: "incineroar", name: "Incineroar", count: 50, pct: 50 },
        { id: "garchomp", name: "Garchomp", count: 20, pct: 20 },
      ],
      byId: {
        incineroar: { moves: [{ name: "Flare Blitz", pct: 100 }], items: [], abilities: [{ name: "Drizzle", pct: 100 }], natures: [] },
        garchomp: { moves: [{ name: "Earthquake", pct: 100 }], items: [], abilities: [], natures: [] },
      },
    }
    const report = archetypeCoverage([mon("charizard", ["Flamethrower", "Protect"])], dex, rain)
    const weather = report.archetypes.find((a) => a.id === "weather")!
    expect(weather.label).toBe("Clima: lluvia")
    expect(weather.prevalence).toBe(50)
    // Charizard no anula el clima ni resiste Agua.
    expect(weather.checks.map((c) => c.ok)).toEqual([false, false])
    // Un setter de sol anula la lluvia; un Agua (Blastoise) la resiste.
    const covered = archetypeCoverage(
      [mon("charizard", ["Sunny Day", "Protect"]), mon("blastoise", ["Surf"])], dex, rain,
    ).archetypes.find((a) => a.id === "weather")!
    expect(covered.checks.every((c) => c.ok)).toBe(true)
  })

  it("marca la prioridad como respuesta a Trick Room", () => {
    const tr: Meta = {
      format: "M-C", tournaments: 1, teams: 1, source: "test",
      usage: [{ id: "incineroar", name: "Incineroar", count: 30, pct: 30 }],
      byId: {
        incineroar: { moves: [{ name: "Trick Room", pct: 100 }], items: [], abilities: [], natures: [] },
      },
    }
    const priority = (team: Team) =>
      archetypeCoverage(team, dex, tr).archetypes.find((a) => a.id === "trickroom")!.checks[0].ok
    expect(priority([mon("charizard", ["Flamethrower", "Protect"])])).toBe(false)
    expect(priority([mon("charizard", ["Extreme Speed", "Flamethrower"])])).toBe(true)
  })

  it("pondera la nota por cuánto del meta juega cada plan", () => {
    // Tailwind (40) + seteo (20): el equipo cumple Tailwind 2/2 y seteo 1/3.
    const plans: Meta = {
      format: "M-C", tournaments: 1, teams: 1, source: "test",
      usage: [
        { id: "incineroar", name: "Incineroar", count: 40, pct: 40 },
        { id: "garchomp", name: "Garchomp", count: 20, pct: 20 },
      ],
      byId: {
        incineroar: { moves: [{ name: "Tailwind", pct: 100 }], items: [], abilities: [], natures: [] },
        garchomp: { moves: [{ name: "Swords Dance", pct: 100 }], items: [], abilities: [], natures: [] },
      },
    }
    const report = archetypeCoverage([mon("charizard", ["Icy Wind", "Extreme Speed"])], dex, plans)
    expect(report.archetypes.map((a) => a.id)).toEqual(["tailwind", "setup"])
    // (1 × 40 + ⅓ × 20) / 60.
    expect(report.score).toBeCloseTo((40 + 20 / 3) / 60, 5)
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

    // Extremos del equipo (contexto).
    expect(s.teamSize).toBe(2)
    expect(s.slowest).toBe(100)
    expect(s.fastest).toBe(120)

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
    // Sets a medias: los fixtures no traen `sp`, objeto ni naturaleza.
    expect(s.members.every((m) => m.missing.join() === "sp,item,nature")).toBe(true)
  })

  it("no marca set a medias cuando SP, objeto y naturaleza están puestos", () => {
    // Reparto completo (66 SP) en stats que no son velocidad: el set está cerrado,
    // así que su velocidad baja es una decisión, no un set sin terminar.
    const full = mon("me", ["Protect"], {
      item: "Leftovers",
      nature: "Calm",
      sp: { hp: 32, def: 2, spd: 32 },
    })
    const s = speedProfile([full], fastDex, fastMeta)
    expect(s.members[0].missing).toEqual([])
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
      for (const v of Object.values(a.speedScenarios)) expect(v).toBeGreaterThanOrEqual(0)
      for (const v of Object.values(a.speedScenarios)) expect(v).toBeLessThanOrEqual(1)
    }
  })
})
