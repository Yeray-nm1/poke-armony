// Demo en consola con datos reales: diagnóstico + recomendaciones.
// Uso: pnpm demo   (ingiere en vivo desde Showdown y Limitless)
import { analyze, groupProposals, proposeEdits, type Team } from "../src/core"
import { fetchBase } from "../src/lib/dataset"
import { fetchMeta } from "../src/lib/meta"

const strongTeam: Team = [
  { id: "arcanine-hisui", name: "Hisuian Arcanine", item: "Focus Sash", ability: "Rock Head", nature: "Jolly", attacks: ["Flare Blitz", "Head Smash", "Extreme Speed", "Protect"] },
  { id: "rillaboom", name: "Rillaboom", item: "Miracle Seed", ability: "Grassy Surge", nature: "Adamant", attacks: ["Wood Hammer", "Grassy Glide", "High Horsepower", "Fake Out"] },
  { id: "primarina", name: "Primarina", item: "Leftovers", ability: "Liquid Voice", nature: "Modest", attacks: ["Hyper Voice", "Moonblast", "Calm Mind", "Protect"] },
  { id: "staraptor", name: "Staraptor", item: "Staraptite", ability: "Intimidate", nature: "Jolly", attacks: ["Close Combat", "Brave Bird", "Tailwind", "Protect"] },
  { id: "raichu", name: "Raichu", item: "Raichunite Y", ability: "Lightning Rod", nature: "Timid", attacks: ["Zap Cannon", "Focus Blast", "Fake Out", "Protect"] },
  { id: "gholdengo", name: "Gholdengo", item: "Life Orb", ability: "Good as Gold", nature: "Modest", attacks: ["Make It Rain", "Shadow Ball", "Nasty Plot", "Protect"] },
]

const weakTeam: Team = [
  { id: "charizard", name: "Charizard", item: "Life Orb", ability: "Blaze", nature: "Timid", attacks: ["Flamethrower", "Air Slash", "Dragon Pulse", "Roost"] },
  { id: "talonflame", name: "Talonflame", item: "Choice Band", ability: "Gale Wings", nature: "Adamant", attacks: ["Brave Bird", "Flare Blitz", "U-turn", "Steel Wing"] },
  { id: "volcarona", name: "Volcarona", item: "Heavy-Duty Boots", ability: "Flame Body", nature: "Timid", attacks: ["Fiery Dance", "Bug Buzz", "Giga Drain", "Quiver Dance"] },
  { id: "moltres", name: "Moltres", item: "Life Orb", ability: "Flame Body", nature: "Modest", attacks: ["Flamethrower", "Air Slash", "Ancient Power", "Roost"] },
  { id: "arcanine", name: "Arcanine", item: "Sitrus Berry", ability: "Intimidate", nature: "Jolly", attacks: ["Flare Blitz", "Extreme Speed", "Wild Charge", "Crunch"] },
  { id: "typhlosion", name: "Typhlosion", item: "Choice Specs", ability: "Blaze", nature: "Timid", attacks: ["Eruption", "Flamethrower", "Focus Blast", "Extrasensory"] },
]

const pct = (x: number) => `${Math.round(x * 100)}%`

async function main() {
  const [base, meta] = await Promise.all([fetchBase(), fetchMeta()])
  const { pokedex, moves, legal } = base

  console.log(`\n=== META ${meta.format} · ${meta.teams} equipos de ${meta.tournaments} torneos ===`)
  console.log("Top 10: " + meta.usage.slice(0, 10).map((u) => `${u.name} ${u.pct}%`).join(" · "))

  const diagnose = (label: string, team: Team) => {
    const a = analyze(team, pokedex, moves, meta)
    console.log(`\n=== ARMONÍA · ${label} ===`)
    console.log(`  Harmonia: ${a.harmony}/100`)
    for (const [k, v] of Object.entries(a.metrics)) console.log(`   · ${k.padEnd(14)} ${pct(v)}`)
    console.log(`  Métricas más débiles: ${a.weakest.join(", ")}`)
    if (a.nakedTypes.length) console.log(`  Debilidades apiladas sin resistencia: ${a.nakedTypes.join(", ")}`)
    if (a.offenseGaps.length) console.log(`  Huecos ofensivos: ${a.offenseGaps.join(", ")}`)
    if (a.unanswered.length) console.log(`  Amenazas sin respuesta: ${a.unanswered.join(", ")}`)
    for (const plan of a.roleFocus.plans) {
      const failed = plan.checks.filter((c) => !c.ok).map((c) => c.label)
      console.log(
        `  Plan ${plan.label}: ${failed.length ? "✗ " + failed.join(" · ") : "✓ bien sostenido"}`,
      )
    }
    if (a.roleFocus.speedControl) console.log("  Control de velocidad: presente (lo puntúa Velocidad)")
  }

  diagnose("EQUIPO REAL (ladder)", strongTeam)
  diagnose("EQUIPO NAIVE (todo Fuego)", weakTeam)

  const { proposals } = proposeEdits(strongTeam, pokedex, moves, meta, { legal: legal.legal, megas: legal.megaStones })
  const grouped = groupProposals(proposals)
  const labels: [keyof typeof grouped, string][] = [["tune", "① AJUSTE"], ["remake", "② REHACER"], ["swap", "③ SUSTITUCIÓN"]]
  console.log(`\n=== RECOMENDACIONES para el equipo real (Δ armonía del CONJUNTO) ===`)
  for (const [key, label] of labels) {
    const items = grouped[key].slice(0, 3)
    if (!items.length) continue
    console.log(` ${label}`)
    for (const p of items) {
      console.log(`  +${p.delta}  ${p.change}${p.fixes.length ? `   ↑ ${p.fixes.join(", ")}` : ""}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
