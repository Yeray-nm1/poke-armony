// Informe de amenaza con daño REAL de Champions. Se calcula aquí (servidor)
// porque `@smogon/calc` (gen 0 = Pokémon Champions) es pesado: no debe inflar el
// bundle del cliente. El cliente envía su equipo actual y recibe el informe completo.
import { detailedReport } from "@/core/damage"
import { getBattle } from "@/lib/data"
import { validateTeam, validateThreatId } from "@/lib/validate"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "cuerpo inválido" }, { status: 400 })
  }
  const { team: rawTeam, threatId } = (body ?? {}) as { team?: unknown; threatId?: unknown }
  const team = validateTeam(rawTeam)
  if (!team.ok) return Response.json({ error: team.error }, { status: 400 })
  const threat = validateThreatId(threatId)
  if (!threat.ok) return Response.json({ error: threat.error }, { status: 400 })
  const ds = await getBattle()
  const report = detailedReport(team.value, threat.value, ds.pokedex, ds.moves, ds.meta)
  return Response.json(report)
}
