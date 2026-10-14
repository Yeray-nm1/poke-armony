// Recomendaciones con daño REAL (Champions). Se calculan en el servidor porque
// `core/recommend-damage` usa `@smogon/calc` (gen 0), que no debe entrar en el
// bundle del cliente. El cliente envía su equipo y recibe el análisis + las
// propuestas re-puntuadas con el cierre de amenazas real.
import { recommendWithDamage } from "@/core/recommend-damage"
import { getBattle } from "@/lib/data"
import { validateTeam } from "@/lib/validate"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "cuerpo inválido" }, { status: 400 })
  }
  const team = validateTeam((body as { team?: unknown } | null)?.team)
  if (!team.ok) {
    return Response.json({ error: team.error }, { status: 400 })
  }
  const ds = await getBattle()
  const result = recommendWithDamage(team.value, ds.pokedex, ds.moves, ds.meta, {
    legal: ds.legal.legal,
    megas: ds.legal.megaStones,
  })
  return Response.json(result)
}
