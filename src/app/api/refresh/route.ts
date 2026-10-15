// Fuerza la re-ingesta de los datos base (Showdown) y del meta vivo (Limitless)
// SIN redeploy. El botón "Actualizar datos" de la cabecera llama aquí y después
// refresca el componente de servidor.
// `{ expire: 0 }` hace que la siguiente petición espere al dato nuevo (sin stale).
//
// Es el endpoint más caro de la app (re-descarga + agrega), así que se limita a
// peticiones de la propia app (`isSameOrigin`) para que un tercero no pueda
// provocar re-ingestas en bucle.
import { revalidateTag } from "next/cache"
import { isSameOrigin } from "@/lib/guard"

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "origen no permitido" }, { status: 403 })
  }
  revalidateTag("data:base", { expire: 0 })
  revalidateTag("data:meta", { expire: 0 })
  return Response.json({ ok: true, requestedAt: new Date().toISOString() })
}
