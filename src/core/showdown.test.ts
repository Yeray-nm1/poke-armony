import { describe, expect, it } from "vitest"
import { dex } from "./fixtures"
import { exportTeam, parseTeam } from "./showdown"

const paste = `Arcanine-Hisui @ Focus Sash
Ability: Rock Head
Level: 50
Jolly Nature
Stat Points: 2 HP / 32 Atk / 32 Spe
- Flare Blitz
- Head Smash
- Extreme Speed
- Protect

Mote (Rillaboom) (M) @ Miracle Seed
Ability: Grassy Surge
Adamant Nature
- Wood Hammer
- Grassy Glide
- High Horsepower
- Fake Out`

describe("parseTeam", () => {
  const team = parseTeam(paste)

  it("lee los dos sets", () => expect(team).toHaveLength(2))

  it("normaliza el id de especie (con guion → sin guion)", () => {
    expect(team[0].id).toBe("arcaninehisui")
  })

  it("lee item, habilidad y naturaleza", () => {
    expect(team[0].item).toBe("Focus Sash")
    expect(team[0].ability).toBe("Rock Head")
    expect(team[0].nature).toBe("Jolly")
  })

  it("lee los Stat Points nativos", () => {
    expect(team[0].sp).toEqual({ hp: 2, atk: 32, spe: 32 })
  })

  it("extrae la especie cuando hay mote", () => {
    expect(team[1].id).toBe("rillaboom")
    expect(team[1].item).toBe("Miracle Seed")
  })

  it("lee los 4 movimientos", () => {
    expect(team[0].attacks).toEqual(["Flare Blitz", "Head Smash", "Extreme Speed", "Protect"])
  })
})

describe("exportTeam", () => {
  it("usa el nombre canónico del pokedex y emite Stat Points", () => {
    const out = exportTeam(parseTeam(paste), dex)
    expect(out).toContain("Arcanine-Hisui @ Focus Sash")
    expect(out).toContain("Stat Points: 2 HP / 32 Atk / 32 Spe")
    expect(out).toContain("- Extreme Speed")
  })

  it("hace round-trip", () => {
    const team = parseTeam(paste)
    expect(parseTeam(exportTeam(team, dex))).toEqual(team)
  })
})

describe("import de EVs (conversión a SP)", () => {
  it("divide entre 8", () => {
    const team = parseTeam(
      "Garchomp @ Life Orb\nAbility: Rough Skin\nJolly Nature\nEVs: 4 HP / 252 Atk / 252 Spe\n- Earthquake",
    )
    expect(team[0].sp).toEqual({ hp: 1, atk: 32, spe: 32 })
  })
})

describe("import valida/recorta el reparto", () => {
  it("acota cada stat a 32 y reparte el exceso hasta 66", () => {
    const team = parseTeam(
      "Garchomp @ Life Orb\nAbility: Rough Skin\nJolly Nature\nEVs: 255 HP / 255 Atk / 255 Spe\n- Earthquake",
    )
    expect(team[0].sp).toEqual({ hp: 22, atk: 22, spe: 22 })
  })

  it("un Stat Points ilegal también se repara", () => {
    const team = parseTeam("Garchomp\nJolly Nature\nStat Points: 40 Atk / 40 Spe\n- Earthquake")
    expect(team[0].sp).toEqual({ atk: 32, spe: 32 })
  })
})
