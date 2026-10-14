# PokeArmony

**[https://poke-armony.vercel.app](https://poke-armony.vercel.app)**

Asistente para **Pokémon Champions** (VGC · Reg **M-C**): analiza **tu equipo** contra
el meta vivo, detecta **los puntos débiles del conjunto** y propone **cambios concretos**
para taparlos antes de jugar. Sin registro, sin base de datos.

## Stack

- **Next.js 16** (App Router, Turbopack, Cache Components) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Vitest** (tests del núcleo) · `tsx` (scripts)
- Datos: **Limitless API** (meta) + **Showdown data** (especies/movimientos)

## Estructura

```
src/
  app/          Pantallas (App Router) — home con el motor ya conectado
  core/         MOTOR PURO (sin I/O, sin React): typechart, stats, harmony, recommender
    *.test.ts   Tests unitarios (fixtures propias, sin red)
  lib/          Frontera con la red (getDataset = ingesta + cache) + equipo de ejemplo
scripts/
  demo.ts       Corre el motor sobre datos reales en consola
```

## Comandos

```bash
pnpm install
pnpm dev        # app en http://localhost:3000
pnpm demo       # diagnóstico + recomendaciones en consola
pnpm test       # tests del núcleo
pnpm test:e2e   # tests E2E de la interfaz (Playwright; necesita red)
pnpm lint && pnpm typecheck
pnpm build      # build de producción
```

## El motor (`src/core`)

`harmony = 100 · Σ(peso · métrica) − penalización_redundancia`

Métricas: **defensa**, **cobertura ofensiva**, **cierre de amenazas**, **roles**,
**velocidad** y **sinergia** (menos **redundancia**). El diagnóstico son las 2–3
métricas más bajas; el recomendador es contrafactual (puntúa el equipo antes/después
de cada edición y rankea por **Δ armonía**), de menor a mayor invasividad:
① ajuste → ② rehacer → ③ sustitución (cualquier Pokémon legal; el uso del meta solo ordena).

## Funcionalidades

- **Motor puro** (`src/core`): typechart, stats, armonía, cierre de amenazas y recomendador,
  sin I/O ni React, con tests unitarios de fixtures propias.
- **Workspace**: equipo editable con drag & drop, **import/export en formato Showdown**,
  diagnóstico y recomendaciones aplicables con un clic, y persistencia en `localStorage`.
- **Detalle de amenaza** (set común + matchup) y **comparador** de cada recomendación antes de
  aplicarla: Δ armonía, métricas y diff del set.
- **Daño/KO reales** con `@smogon/calc` (generación 0 = Champions) calculados en el servidor,
  **velocidad a L50 con SP y naturaleza reales** y **roster legal M-C + las 6 Megas nuevas**
  (Absol-Z, Garchomp-Z, Lucario-Z, Salamence, Golisopod, Baxcalibur) como candidatas.
- **Recomendador por niveles**: ① ajuste → ② rehacer (misma especie, otro rol) → ③ sustitución.
- **Daño real en el recomendador**: el cierre de amenazas deja de ser por tipos y pasa a daño/KO
  reales. El cliente genera candidatos al instante y el servidor (`/api/recommend`) re-puntúa el
  equipo base y los mejores candidatos de cada nivel con `@smogon/calc`.

## Motor de daño

`core/damage.ts` envuelve `@smogon/calc` con la **generación 0 = Pokémon Champions** del
paquete: nivel 50 fijo, Stat Points como entrada (1 SP = 1 punto a L50, igual que
`stats.ts`), el roster legal del formato y las stats/tipos de las Megas nuevas. La Mega se
resuelve por la piedra (`Absolite Z` → `Absol-Mega-Z`). `@smogon/calc` **nunca entra en el
bundle del cliente**: se usa en el servidor para el panel de amenaza (`/api/threat-report`)
y para re-puntuar el recomendador (`/api/recommend`). El recomendador es **híbrido**: el
cliente genera candidatos al instante con el motor de tipos y el servidor re-puntúa el
cierre de amenazas con daño real (una amenaza está "cerrada" si algún miembro aguanta la
peor tirada Y puede hacerle KO), cacheando el veredicto por (set × amenaza) para que
re-puntuar sea barato. La amenaza se modela como *benchmark ofensivo* (32 SP en su ataque
principal) porque Limitless no publica los SP de la oposición.

## Import / Export

El formato es **Showdown**, adaptado a Champions: al exportar se emite una línea
`Stat Points:` (SP nativos; 1 SP = 1 punto a L50) y al importar se aceptan tanto
`Stat Points:`/`SPs:` como `EVs:` (se convierten a SP dividiendo entre 8). El id de
especie se normaliza con `toId`, así que los nombres como `Arcanine-Hisui` resuelven
contra el pokedex (que usa claves sin guion).

## Cabos conocidos

- Los ids de **Limitless** llevan guion (`arcanine-hisui`) y los del **pokedex de Showdown**
  no (`arcaninehisui`): el motor normaliza con `toId` (antes se perdían las formas regionales).
- El meta de Limitless **no trae Stat Points** → la velocidad de la oposición se modela con
  inversión máxima para los rápidos (base ≥ 90) y 0 para el resto; la del usuario usa sus SP reales.
- Las **Megas nuevas de Champions** (Absol-Z, etc.) y su roster legal vienen de `@smogon/calc`
  (gen 0) y se fusionan en el pokedex durante la ingesta (runtime); se **añaden** solo las especies
  que Showdown no tiene (no se sobreescriben las base). Sus stats están **contrastadas con
  Game8/Serebii** —la velocidad 151 de Absol-Z/Garchomp-Z/Lucario-Z es real, no un relleno del
  fork— y un test (`damage.test.ts`) fija esa tabla como regresión.
- El **recomendador** es híbrido: el cliente genera candidatos al instante **por tipos** y el
  servidor (`/api/recommend`) re-puntúa el **cierre de amenazas con daño/KO reales**; el resto
  de métricas siguen siendo por tipos por rendimiento.
- El nivel **② rehacer** conserva los **SP** del set del usuario (Limitless no publica SP del
  meta) y solo se propone si el set declara naturaleza y el meta ofrece una **naturaleza
  alternativa** (es decir, un rol distinto real).
- **Datos siempre en vivo:** el dataset se ingiere en runtime desde Showdown + Limitless y se
  sirve desde cache. No hay copia local ni *fallback*: si una fuente no responde, la ingesta
  falla en vez de servir datos viejos.
- **Cache en dos niveles:** la página es un *shell* estático y cachea la ingesta en el build;
  los route handlers, al ser dinámicos y correr en serverless, usan **`"use cache: remote"`**
  (Runtime Cache en Vercel) con un camino de datos sin learnsets, para no re-ingerir en cada
  petición.
