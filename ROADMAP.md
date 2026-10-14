# PokeArmony — hoja de ruta

> **Nota local, NO versionada.** Vive solo en este equipo (ignorada con `.git/info/exclude`).
> Reconstruida el 2026-10-14, después de borrar y recrear el repo para la limpieza pública.
> El `SPEC.md` original (que contenía principios, métricas, wireframes y esta hoja de ruta)
> se eliminó por completo y **no es recuperable** (ni en disco, ni en git, ni en backups).
> Esta lista es, por tanto, una reconstrucción nueva a partir del README y del código.

---

## 1. Estado a 2026-10-14

| | |
|---|---|
| Producción | https://pokearmony.vercel.app · HTTP 200 · TTFB ~0,19 s |
| Repo | `Yeray-nm1/poke-armony` · público · rama `main` · 54 commits · 82 ficheros |
| Tests | 124 de núcleo puro (`src/core/*.test.ts`, `src/lib/*.test.ts`) + **7 E2E** (Playwright, `e2e/`) |
| Stack | Next 16.4 · React 19.3 · Tailwind v4 · zustand · motion · `@smogon/calc` 0.12 |
| Payload home | **3,79 MB** sin comprimir · ~430 KB gzip · los `learnsets` son el grueso |

## 2. Decisiones cerradas (no reabrir sin querer)

- **API-only**: ni semilla local ni *fallback*; si Showdown o Limitless fallan, la ingesta falla.
- **Sin registro, sin BD, sin analítica**: el equipo vive en `localStorage`.
- **Motor puro** en `src/core` (sin I/O ni React). `@smogon/calc` **solo en servidor** (0 refs en el bundle cliente).
- **Recomendador híbrido**: el cliente genera candidatos por tipos al instante; el servidor re-puntúa el cierre de amenazas con daño/KO reales.
- **Payload de la home**: **descartado** (2026-10-14). Los 3,79 MB **no son un problema**
  (~430 KB gzip, TTFB ~0,19 s), así que no se toca. (Estaba como P1 y se ha retirado.)
- **Cobertura E2E**: **implementada** (2026-10-14, commit `66c7ee7`). **Playwright** con 7 flujos en
  `e2e/`: carga + diagnóstico, drag & drop de ranuras, import/export Showdown con persistencia,
  aplicar una recomendación, comparador y detalle de amenaza. Servidor propio en el puerto **3210**
  (no choca con `pnpm dev`); `E2E_BASE_URL` permite lanzarlos contra el deploy. **Necesitan red.**
- **Validación de las rutas API**: **implementada** (2026-10-14, commit `52d20f9`). `src/lib/validate.ts`
  (a mano, **sin zod** ni dependencias nuevas) valida `{ team }` y `{ threatId }` y devuelve un `Team`
  saneado por lista blanca. Antes un set sin `id`/`attacks` o con tipos raros **reventaba el motor (500)**;
  ahora es 400 con el motivo. Topes: 6 sets, 24 movimientos/set, 64 car./texto, SP 0–32 y stats conocidas.
  124 tests (19 nuevos).
- Champions tiene **naturalezas, no Tera**.

## 3. Pendientes priorizados

> Etiquetas reordenadas el 2026-10-14 al desaparecer dos pendientes (payload y E2E, ambos resueltos: ver §2).

### P1 · Daño real en más métricas
- **Qué**: solo el *cierre de amenazas* usa `@smogon/calc` (`src/core/recommend-damage.ts`); el resto de métricas siguen siendo por tipos "por rendimiento".
- **Por qué**: la cobertura ofensiva por tipos puede engañar (STAB, potencia real, inmunidades).
- **Riesgo**: coste de cómputo; el híbrido actual es justamente lo que lo mantiene rápido.
- **Análisis (2026-10-14)**: **`offense`** es la que más gana (el tipo es un proxy pobre: hoy un
  movimiento de 40 BP "cubre" igual que un STAB de 120). **`defense`** es la que menos: la
  supervivencia real depende del spread defensivo del rival, que Limitless **no publica** → mucho
  coste para poca certeza. Costes a asumir: más CPU/latencia (serverless), **divergencia
  cliente↔servidor** (el cliente no puede calcular daño real: la vista previa local diferiría más de
  la autoritativa, y el listado encogería porque el servidor descarta `delta <= 0`) y recalibrado de
  `WEIGHTS` + tests. **Alternativa barata**: endurecer el proxy por tipos (exigir potencia mínima /
  ponderar por base power) → casi toda la ganancia, cero coste de servidor.

### P2 · Fallback de datos si las fuentes caen
- **Qué**: `getJSON` (`src/lib/http.ts`) reintenta 429/5xx con backoff (4 intentos con jitter), pero si todo falla la ingesta **falla**.
- **Por qué**: un fallo puntual de Limitless deja la app sin meta. El *static shell* y `cacheLife` ya amortiguan, pero no hay "servir lo último bueno".
- **Decisión previa**: se descartó a propósito (API-only). Reabrir **solo** si la disponibilidad pasa a importar.

### P2 · Recalentar el Runtime Cache tras cada deploy
- **Qué**: `getBattle()` usa `"use cache: remote"`; cada deploy invalida el cache y la 1ª petición re-ingiere (~3-4 s).
- **Sugerencia**: Deploy Hook o cron que haga un `POST` a los endpoints justo después del deploy.

### P2 · Afinar la modelización de la oposición
- **Qué**: Limitless **no publica SP** → velocidad de la oposición con heurística (base ≥ 90 = inversión máxima; resto 0) y amenaza como *benchmark* ofensivo (32 SP). El nivel ② *rehacer* solo se propone si el meta ofrece una naturaleza alternativa.
- **Qué haría falta**: que Limitless publicase SP; entonces se afinan velocidad y ② *rehacer*.

### P3 · Cabos que quedan de la validación de la API
- **Qué**: (a) un `threatId` desconocido devuelve **200 con un informe falso** (`name` = el id, `types: []`,
  `usage: 0`) → candidato a **404**; (b) `src/app/api/refresh/route.ts` **no valida ni protege nada**, y es
  el endpoint más abusable (fuerza re-ingesta de Showdown + Limitless).
- **Sugerencia**: (a) comprobar `meta.byId[threatId]` (o `speciesOf`) y responder 404; (b) decidir un guardia
  (mismo origen, token o *rate limit*).

## 4. Ideas abiertas (sin decidir)

- **i18n**: la app es solo en español; Champions es global. Se puede plantear si se busca alcance.

## 5. Convenciones (válidas si se retoma la UI)

- Estático y sobrio: movimiento **sutil** (`motion/react`) solo donde aporta; nunca animación llamativa.
- Paneles con **bisel interior** (glass, ligeramente translúcidos): `.bezel`; anillo Pokébola `.hud` (en `globals.css`).
- **Sin muescas** en esquinas; **sin acento de tipo** en los drawers.
- Análisis **a nivel de equipo**, en orden **① ajuste → ② rehacer → ③ sustituir**.
- "KO" en mayúsculas y sin puntos; **nunca** "tumb…".
- Veredicto `counter` = etiqueta **"Fuerte"**.
- Desempate de KO mutuo: prioridad → velocidad (SP/naturaleza, + Choice Scarf) → efectividad de tipo; empate total = **derrota**.
- Aviso de control de velocidad en el `Hint` de la cabecera.
- Sello de autor: **"Diseñado y desarrollado por YerayD"**, con cursor parpadeante y sin `//`.
- Responsive ya resuelto: footer en iPad, paneles de edición en vertical, header móvil, footer < 736 px, cierre del detalle de amenaza + chip "Responde x/6".

## 6. Notas operativas

- **Vercel**: proyecto `pokearmony` (`prj_QBBOrBol97mGN5FtuL6nghEAeugO`, equipo `team_H8eqZgJgkXJNah4lyRSFMjzn`). Los push a `main` → producción; otras ramas → previews protegidos.
- **Vercel, metadata Git**: resuelto. El deployment `66c7ee7` (2026-10-14) ya se construyó desde el repo nuevo, así que la metadata Git apunta al repo correcto.
- **Ojo**: Vercel **omite commits ya construidos** (dedupe por SHA). Para probar el auto-deploy hace falta un commit *nuevo* (una rama desechable sirve).
- **E2E**: `pnpm test:e2e` levanta un servidor propio en el puerto **3210** (no pisa el `pnpm dev` de 3000) y necesita **red** (ingesta viva). `E2E_BASE_URL=… pnpm test:e2e` los lanza contra un servidor ya en marcha o contra el deploy. Chromium ya está descargado en la caché de Playwright.
- `pnpm typecheck` falla con `Cannot find name 'LayoutProps'` si se borró `.next`: correr `pnpm build` antes.
- `AGENTS.md` lo autoregenera `next dev`; está en `.gitignore` para no ensuciar el árbol.
- El README documenta los cabos del motor en "Cabos conocidos": mantenerlos sincronizados si se toca el motor.
- **Aviso de la sesión (2026-10-14)**: tras un error del proveedor (`HTTP 400 {"model":"big-pickle"}`) y su reanudación, **se revirtieron las ediciones sin commitear de ficheros *trackeados*** (`package.json`, `tsconfig.json`, `.gitignore`); los ficheros **nuevos** (no trackeados) sobrevivieron. Moraleja: revisar el estado justo antes de commitear.
