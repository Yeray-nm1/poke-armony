// Descargas HTTP con reintentos ante límites de tasa (429) o fallos transitorios (5xx).
const MAX_RETRIES = 4

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function backoff(attempt: number): number {
  // 0.5 s, 1 s, 2 s, 4 s… con jitter para no sincronizar reintentos.
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250)
}

export async function getJSON<T>(url: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { headers: { accept: "application/json" } })
    } catch (err) {
      lastErr = err
      if (attempt === MAX_RETRIES) break
      await sleep(backoff(attempt))
      continue
    }
    if (res.ok) return res.json() as Promise<T>

    // 429 (límite de tasa) y 5xx (transitorio) se reintentan; el resto, no.
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`${res.status} ${res.statusText} — ${url}`)
      if (attempt === MAX_RETRIES) break
      const retryAfter = Number(res.headers.get("retry-after"))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt))
      continue
    }
    throw new Error(`${res.status} ${res.statusText} — ${url}`)
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
