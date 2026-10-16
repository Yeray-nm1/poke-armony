// Fixtures pequeños y deterministas para los tests del núcleo.
import type { Meta, MoveDex, Pokedex } from "./types"

const s = (hp: number, atk: number, def: number, spa: number, spd: number, spe: number) =>
  ({ hp, atk, def, spa, spd, spe })

export const dex: Pokedex = {
  charizard: { name: "Charizard", types: ["Fire", "Flying"], baseStats: s(78, 84, 78, 109, 85, 100) },
  infernape: { name: "Infernape", types: ["Fire", "Fighting"], baseStats: s(76, 104, 71, 104, 71, 108) },
  incineroar: { name: "Incineroar", types: ["Fire", "Dark"], baseStats: s(95, 115, 90, 80, 90, 60) },
  blastoise: { name: "Blastoise", types: ["Water"], baseStats: s(79, 83, 100, 85, 105, 78) },
  venusaur: { name: "Venusaur", types: ["Grass", "Poison"], baseStats: s(80, 82, 83, 100, 100, 80) },
  garchomp: { name: "Garchomp", types: ["Dragon", "Ground"], baseStats: s(108, 130, 95, 80, 85, 102) },
  garchompmega: { name: "Garchomp-Mega", types: ["Dragon", "Ground"], baseStats: s(108, 170, 115, 120, 95, 92) },
  magnezone: { name: "Magnezone", types: ["Electric", "Steel"], baseStats: s(70, 70, 115, 130, 90, 60) },
  togekiss: { name: "Togekiss", types: ["Fairy", "Flying"], baseStats: s(85, 50, 95, 120, 115, 80) },
  lycanroc: { name: "Lycanroc", types: ["Rock"], baseStats: s(75, 115, 65, 55, 65, 112) },
  // Clave SIN guion (como el pokedex real) para probar la normalización de ids.
  arcaninehisui: { name: "Arcanine-Hisui", types: ["Fire", "Rock"], baseStats: s(95, 115, 80, 45, 80, 90) },
}

export const moves: MoveDex = {
  flamethrower: { name: "Flamethrower", type: "Fire", category: "Special", basePower: 90 },
  flareblitz: { name: "Flare Blitz", type: "Fire", category: "Physical", basePower: 120 },
  hydropump: { name: "Hydro Pump", type: "Water", category: "Special", basePower: 110 },
  surf: { name: "Surf", type: "Water", category: "Special", basePower: 90, target: "allAdjacent" },
  earthquake: { name: "Earthquake", type: "Ground", category: "Physical", basePower: 100, target: "allAdjacent" },
  rockslide: { name: "Rock Slide", type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes" },
  icebeam: { name: "Ice Beam", type: "Ice", category: "Special", basePower: 90 },
  thunderbolt: { name: "Thunderbolt", type: "Electric", category: "Special", basePower: 90 },
  grassyglide: { name: "Grassy Glide", type: "Grass", category: "Physical", basePower: 70 },
  closecombat: { name: "Close Combat", type: "Fighting", category: "Physical", basePower: 120 },
  moonblast: { name: "Moonblast", type: "Fairy", category: "Special", basePower: 95 },
  protect: { name: "Protect", type: "Normal", category: "Status", basePower: 0 },
  fakeout: { name: "Fake Out", type: "Normal", category: "Physical", basePower: 40 },
  nastyplot: { name: "Nasty Plot", type: "Dark", category: "Status", basePower: 0 },
  tailwind: { name: "Tailwind", type: "Flying", category: "Status", basePower: 0 },
}

const set = (moves: [string, number][], items: [string, number][] = [], abilities: [string, number][] = [], natures: [string, number][] = []) => ({
  moves: moves.map(([name, pct]) => ({ name, pct })),
  items: items.map(([name, pct]) => ({ name, pct })),
  abilities: abilities.map(([name, pct]) => ({ name, pct })),
  natures: natures.map(([name, pct]) => ({ name, pct })),
})

export const meta: Meta = {
  format: "M-C",
  tournaments: 1,
  teams: 1,
  usage: [
    { id: "incineroar", name: "Incineroar", count: 20, pct: 20 },
    { id: "garchomp", name: "Garchomp", count: 15, pct: 15 },
    { id: "lycanroc", name: "Lycanroc", count: 10, pct: 10 },
    { id: "togekiss", name: "Togekiss", count: 8, pct: 8 },
    { id: "magnezone", name: "Magnezone", count: 5, pct: 5 },
  ],
  byId: {
    incineroar: set(
      [["Flare Blitz", 90], ["Protect", 80]],
      [["Sitrus Berry", 40], ["Assault Vest", 20]],
      [["Intimidate", 95], ["Blaze", 20]],
      [["Careful", 50], ["Adamant", 25]],
    ),
    garchomp: set([["Earthquake", 95], ["Protect", 70]], [["Life Orb", 30]], [["Rough Skin", 90]], [["Jolly", 60]]),
    lycanroc: set([["Close Combat", 80], ["Protect", 60]], [], [], []),
    togekiss: set([["Moonblast", 85], ["Protect", 50]], [], [], []),
    magnezone: set([["Thunderbolt", 90], ["Protect", 40]], [], [], []),
  },
}
