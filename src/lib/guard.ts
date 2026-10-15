// Guardias para las rutas de la API.
//
// `isSameOrigin` frena el abuso tipo CSRF: `/api/refresh` fuerza una re-ingesta
// cara (Showdown + Limitless) y no debe poder dispararse desde un sitio de
// terceros que incruste la app o haga un `fetch` cruzado.

/**
 * ¿La petición viene de la propia app?
 *
 * - Con cabecera `Origin` (los navegadores la envían también en peticiones
 *   same-origin) exige que coincida con el `Host` al que se dirigió la petición.
 * - Sin `Origin` (clientes que no son navegador) cae a `Sec-Fetch-Site`, que el
 *   navegador marca como `same-origin`. Un `curl` no envía ninguna de las dos,
 *   así que se rechaza.
 */
export function isSameOrigin(request: Request): boolean {
  const host = request.headers.get("host")
  if (!host) return false
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin"
}
