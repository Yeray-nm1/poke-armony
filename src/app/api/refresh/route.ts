// Fuerza la re-ingesta de los datos base (Showdown) y del meta vivo (Limitless)
// SIN redeploy. El botón "Actualizar datos" de la cabecera llama aquí y después
// refresca el componente de servidor.
// `{ expire: 0 }` hace que la siguiente petición espere al dato nuevo (sin stale).
import { revalidateTag } from "next/cache"

export async function POST() {
  revalidateTag("data:base", { expire: 0 })
  revalidateTag("data:meta", { expire: 0 })
  return Response.json({ ok: true, requestedAt: new Date().toISOString() })
}
