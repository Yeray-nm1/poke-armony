// Pruebas del daño real con @smogon/calc (generación 0 = Champions).
// Los valores se verificaron contra el propio motor de cálculo (determinista).
import { describe, expect, it } from "vitest"
import { toID } from "@smogon/calc"
import { championGen, damageClosure, damageMatchups, detailedReport } from "./damage"
import { dex, meta, moves } from "./fixtures"
import type { Team } from "./types"

const team: Team = [
  // Blastoise: aguanta Flare Blitz de Incineroar y le hace un 2HKO con Surf.
  { id: "blastoise", attacks: ["Surf", "Protect"], sp: { hp: 32 } },
  // Charizard: aguanta el golpe pero no amenaza de vuelta.
  { id: "charizard", attacks: ["Flamethrower", "Protect"], sp: { spa: 32 } },
  // Magnezone no está en el roster legal de Champions → no hay cálculo.
  { id: "magnezone", attacks: ["Thunderbolt", "Protect"] },
]

describe("daño real (Champions)", () => {
  it("calcula el recibido y el infligido con Stat Points", () => {
    const d = damageMatchups(team, "incineroar", dex, meta)
    expect(d).toHaveLength(3)

    // Blastoise recibe el Flare Blitz (47-56, 25-30%) y responde con 2HKO de Surf.
    const blastoise = d.find((m) => m.slot === 0)!
    expect(blastoise.survivesThreat).toBe(true)
    expect(blastoise.answers).toBe(true)
    expect(blastoise.verdict).toBe("counter")
    const fb = blastoise.incoming.find((r) => r.move === "Flare Blitz")
    expect(fb).toMatchObject({ min: 47, max: 56, pctMin: 25, pctMax: 30 })
    const surf = blastoise.outgoing.find((r) => r.move === "Surf")
    expect(surf).toMatchObject({ min: 90, max: 108, pctMin: 53, pctMax: 64 })
    expect(surf!.koChance).toBe(0) // no es OHKO, pero el 2HKO garantizado cuenta como respuesta

    // Charizard aguanta pero no amenaza → neutral.
    const charizard = d.find((m) => m.slot === 1)!
    expect(charizard.survivesThreat).toBe(true)
    expect(charizard.answers).toBe(false)
    expect(charizard.verdict).toBe("neutral")
    expect(charizard.incoming[0]).toMatchObject({ min: 57, max: 68, pctMin: 37, pctMax: 44 })
    expect(charizard.outgoing[0]).toMatchObject({ min: 33, max: 40, pctMin: 19, pctMax: 24 })

    // Magnezone (fuera del roster) se salta sin romper el informe.
    const magnezone = d.find((m) => m.slot === 2)!
    expect(magnezone.incoming).toEqual([])
    expect(magnezone.verdict).toBe("neutral")
  })

  it("la respuesta al daño no depende del orden de los movimientos", () => {
    // Blastoise: Fake Out (débil) + Surf (2HKO garantizado) frente a Incineroar.
    // El veredicto debe ser el mismo con el movimiento fuerte en cualquier posición.
    const inOrder = damageMatchups([{ id: "blastoise", attacks: ["Fake Out", "Surf"], sp: { hp: 32 } }], "incineroar", dex, meta)[0]!
    const reversed = damageMatchups([{ id: "blastoise", attacks: ["Surf", "Fake Out"], sp: { hp: 32 } }], "incineroar", dex, meta)[0]!
    expect(inOrder.answers).toBe(true)
    expect(inOrder.verdict).toBe("counter")
    expect(reversed.answers).toBe(true)
    expect(reversed.verdict).toBe("counter")
  })

  it("marca 'KO mutuo' cuando ambos se tumban en un golpe y decide prioridad/velocidad", () => {
    // Infernape (frágil) vs Garchomp: Earthquake ×2 lo tumba de un golpe,
    // pero Ice Beam ×4 contra Dragón/Tierra también tumba a Garchomp de uno.
    const slow = damageMatchups([{ id: "infernape", attacks: ["Ice Beam"], sp: { spa: 32 } }], "garchomp", dex, meta)[0]!
    expect(slow.survivesThreat).toBe(false) // la amenaza lo OHKO
    expect(slow.outgoing[0]!.koChance).toBeGreaterThanOrEqual(0.5) // y él la OHKO
    expect(slow.verdict).toBe("koMutuo")
    expect(slow.koRace).toBe("lose") // Garchomp (Jolly) es más rápido
    expect(slow.answers).toBe(false)

    // Con inversión en Velocidad, Infernape gana el intercambio.
    const fast = damageMatchups(
      [{ id: "infernape", nature: "Timid", attacks: ["Ice Beam"], sp: { spa: 32, spe: 32 } }],
      "garchomp",
      dex,
      meta,
    )[0]!
    expect(fast.verdict).toBe("koMutuo")
    expect(fast.koRace).toBe("win")
    expect(fast.answers).toBe(true)
  })

  it("compone el informe detallado (tipos + daño) y detecta si hay respuesta real", () => {
    const r = detailedReport(team, "incineroar", dex, moves, meta)
    expect(r.name).toBe("Incineroar")
    expect(r.attackTypes).toContain("Fire")
    expect(r.damage).toHaveLength(3)
    expect(r.damageAnswered).toBe(true)

    // Equipo sin respuesta real → damageAnswered false.
    const weak: Team = [
      { id: "charizard", attacks: ["Flamethrower"], sp: { spa: 32 } },
      { id: "venusaur", attacks: ["Grassy Glide"], sp: {} },
    ]
    const r2 = detailedReport(weak, "incineroar", dex, moves, meta)
    expect(r2.damageAnswered).toBe(false)
  })
})

describe("cierre de amenazas con daño real", () => {
  it("marca como sin respuesta las amenazas que nadie aguanta+tumba", () => {
    const c = damageClosure(team, dex, meta)
    expect(c.score).toBeGreaterThan(0)
    expect(c.score).toBeLessThanOrEqual(1)
    // Magnezone está en el meta pero fuera del roster legal → sin cálculo.
    expect(c.unanswered).toContain("magnezone")
  })

  it("mejora al incorporar una respuesta real a Incineroar", () => {
    const noAnswer: Team = [{ id: "venusaur", attacks: ["Protect"], sp: {} }]
    // Blastoise aguanta el Flare Blitz y hace 2HKO con Surf (ver test anterior).
    const answer: Team = [{ id: "blastoise", attacks: ["Surf", "Protect"], sp: { hp: 32 } }]
    expect(damageClosure(noAnswer, dex, meta).unanswered).toContain("incineroar")
    expect(damageClosure(answer, dex, meta).unanswered).not.toContain("incineroar")
  })

  it("expone el punto único de fallo con daño real", () => {
    const c = damageClosure(team, dex, meta)
    // Incineroar solo lo cierra Blastoise de verdad (Charizard aguanta sin tumbar
    // y Magnezone no calcula) → pieza crítica en la ranura 0.
    const incin = c.criticality.pieces.find((p) => p.threats.includes("incineroar"))
    expect(incin).toMatchObject({ slot: 0, id: "blastoise" })
  })
})

// Stats oficiales de las Megas nuevas de Champions, contrastadas con Game8
// (game8.co/games/Pokemon-Champions/archives/592472, actualizado 2026-09-18) y
// Serebii (serebii.net/pokemonchampions/megaabilities.shtml). La velocidad 151
// de las "Z" es real: NO es un relleno del fork de @smogon/calc.
const OFFICIAL_NEW_MEGAS = [
  { name: "Absol-Mega-Z", ability: "Sharpness", baseStats: [65, 154, 60, 75, 60, 151] },
  { name: "Garchomp-Mega-Z", ability: "Levitate", baseStats: [108, 130, 85, 141, 85, 151] },
  { name: "Lucario-Mega-Z", ability: "Aura Guard", baseStats: [70, 100, 70, 164, 70, 151] },
  { name: "Salamence-Mega", ability: "Aerilate", baseStats: [95, 145, 130, 120, 90, 120] },
  { name: "Golisopod-Mega", ability: "Tough Claws", baseStats: [75, 150, 175, 70, 120, 40] },
  { name: "Baxcalibur-Mega", ability: "Thermal Exchange", baseStats: [115, 175, 117, 105, 101, 87] },
] as const

describe("Megas nuevas de Champions (procedencia de datos)", () => {
  it("las stats del motor coinciden con la tabla oficial", () => {
    const gen = championGen()
    for (const mega of OFFICIAL_NEW_MEGAS) {
      const sp = gen.species.get(toID(mega.name))
      expect(sp, mega.name).toBeTruthy()
      const [hp, atk, def, spa, spd, spe] = mega.baseStats
      expect(sp!.baseStats, mega.name).toMatchObject({ hp, atk, def, spa, spd, spe })
      expect(sp!.abilities?.[0], mega.name).toBe(mega.ability)
    }
  })
})