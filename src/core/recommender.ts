// Recomendador contrafactual: puntúa el equipo antes/después de cada edición y
// propone solo los cambios que MEJORAN el conjunto, ordenados por Δ armonía.
// Niveles, de menor a mayor invasividad: ① ajuste → ② rehacer → ③ sustitución.
import { analyze, speciesOf, toId, type Analysis, type ClosureFn } from "./harmony"
import type { MegaStoneInfo, Meta, MoveDex, Pokedex, SetStats, Team, TeamSet } from "./types"

export type Tier = "tune" | "remake" | "swap"
export type Kind = "item" | "move" | "remake" | "swap"

export interface Proposal {
  tier: Tier
  kind: Kind
  slot: number
  change: string
  delta: number
  fixes: string[]
  /** Set resultante para esa ranura (permite aplicar la propuesta con un clic). */
  nextSet: TeamSet
  /** Análisis completo del equipo tras aplicar el cambio (mismas métricas que el panel). */
  after: Analysis
}

export function improvedMetrics(before: Analysis, after: Analysis): string[] {
  return (Object.keys(after.metrics) as (keyof Analysis["metrics"])[])
    .filter((k) => k !== "redundancy" && after.metrics[k] - before.metrics[k] > 0.02)
}

/** Set representativo de una especie a partir del meta (para candidatos de sustitución). */
export function representativeSet(id: string, meta: Meta, dex: Pokedex): TeamSet {
  const st = meta.byId[id]
  const attacks = [...new Set((st?.moves ?? []).slice(0, 4).map((m) => m.name))]
  while (attacks.length < 4) attacks.push("Protect")
  return {
    id, name: speciesOf(dex, id)?.name ?? id,
    item: st?.items[0]?.name, ability: st?.abilities[0]?.name,
    nature: st?.natures[0]?.name, attacks,
  }
}

/**
 * ② Rehacer — mismo Pokémon, otro rol. Reconstruye el set con las opciones del
 * meta que NO usa el set actual (naturaleza alternativa + habilidad/item/movs
 * coherentes). Devuelve `null` si el set no declara naturaleza o el meta no
 * ofrece un rol alternativo (en tal caso no hay un "otro set" que proponer).
 */
export function remakeSet(set: TeamSet, st: SetStats): TeamSet | null {
  if (!set.nature) return null
  const altNature = st.natures.find((n) => n.name !== set.nature)?.name
  if (!altNature) return null
  const altAbility = st.abilities.find((a) => a.name !== set.ability)?.name ?? set.ability
  const altItem = st.items.find((i) => i.name !== set.item)?.name ?? set.item
  // Alinea los movimientos con el nuevo rol: cambia el movimiento menos usado por
  // el mejor movimiento del meta que aún no esté en el set.
  const missing = st.moves.find((m) => !set.attacks.includes(m.name))
  const pctOf = (m: string) => st.moves.find((x) => x.name === m)?.pct ?? 0
  const least = [...set.attacks].sort((a, b) => pctOf(a) - pctOf(b))[0]
  const attacks = missing
    ? [...set.attacks.filter((m) => m !== least), missing.name].slice(0, 4)
    : [...set.attacks]
  return { ...set, nature: altNature, ability: altAbility, item: altItem, attacks }
}

export interface RecommendOptions {
  /** Tamaño del pool de sustitución (por uso del meta). */
  poolSize?: number
  /** Pool legal del formato (ids Showdown). Filtra los candidatos. */
  legal?: string[]
  /** Megas disponibles por especie base (para candidatos de sustitución). */
  megas?: Record<string, MegaStoneInfo[]>
  /** Cierre de amenazas real (servidor). Si falta, se usa el de tipos. */
  closure?: ClosureFn
}

/** Límite de candidatos Mega para no disparar el coste del contrafactual. */
const MEGA_CAP = 10

export function proposeEdits(team: Team, dex: Pokedex, moves: MoveDex, meta: Meta, opts: RecommendOptions = {}) {
  const poolSize = opts.poolSize ?? 30
  const base = analyze(team, dex, moves, meta, { closure: opts.closure })
  const clones = (): Team => team.map((s) => ({ ...s, attacks: [...s.attacks], sp: s.sp ? { ...s.sp } : undefined }))
  const out: Proposal[] = []

  const evaluate = (t: Team, p: Omit<Proposal, "delta" | "fixes" | "nextSet" | "after">) => {
    const a = analyze(t, dex, moves, meta, { closure: opts.closure })
    const delta = a.harmony - base.harmony
    if (delta > 0) out.push({ ...p, delta: +delta.toFixed(1), fixes: improvedMetrics(base, a), nextSet: t[p.slot], after: a })
  }

  // ① Ajuste — item (misma especie, item más usado del meta)
  team.forEach((s, i) => {
    const st = meta.byId[s.id]; if (!st) return
    for (const it of st.items.slice(0, 3)) {
      if (it.name === s.item) continue
      const t = clones(); t[i].item = it.name
      evaluate(t, { tier: "tune", kind: "item", slot: i, change: `${s.name ?? s.id}: item ${s.item ?? "—"} → ${it.name}` })
    }
  })

  // ① Ajuste — movimiento (cambia el movimiento menos usado del set por uno del meta)
  team.forEach((s, i) => {
    const st = meta.byId[s.id]; if (!st) return
    const current = new Set(s.attacks)
    const pctOf = (m: string) => st.moves.find((x) => x.name === m)?.pct ?? 0
    const least = [...s.attacks].sort((a, b) => pctOf(a) - pctOf(b))[0]
    for (const mv of st.moves.slice(0, 6)) {
      if (current.has(mv.name)) continue
      const t = clones()
      t[i].attacks = [...t[i].attacks.filter((m) => m !== least), mv.name].slice(0, 4)
      evaluate(t, { tier: "tune", kind: "move", slot: i, change: `${s.name ?? s.id}: ${least} → ${mv.name}` })
    }
  })

  // ② Rehacer — misma especie, otro rol (naturaleza + habilidad + item + movs del meta)
  team.forEach((s, i) => {
    const st = meta.byId[s.id]; if (!st) return
    const alt = remakeSet(s, st); if (!alt) return
    const xtra = [alt.ability && alt.ability !== s.ability ? alt.ability : null, alt.item && alt.item !== s.item ? alt.item : null]
      .filter(Boolean)
      .join(" · ")
    const t = clones(); t[i] = alt
    evaluate(t, {
      tier: "remake", kind: "remake", slot: i,
      change: `${s.name ?? s.id}: rehacer como ${alt.nature}${xtra ? ` (${xtra})` : ""}`,
    })
  })

  // ③ Sustitución — cualquier especie legal (el meta solo ORDENA los candidatos)
  const legalPool = !opts.legal
    ? meta.usage.slice(0, poolSize).map((u) => u.id)
    : meta.usage
        .slice(0, Math.max(poolSize, opts.legal.length))
        .map((u) => u.id)
        .filter((id) => opts.legal!.includes(toId(id)))
  const candidates = legalPool.filter((id) => speciesOf(dex, id) && !team.some((s) => toId(s.id) === toId(id)))
  for (let i = 0; i < team.length; i++) {
    for (const cand of candidates.slice(0, poolSize)) {
      const t = clones(); t[i] = representativeSet(cand, meta, dex)
      evaluate(t, { tier: "swap", kind: "swap", slot: i, change: `slot ${i + 1}: ${team[i].name ?? team[i].id} → ${speciesOf(dex, cand)?.name ?? cand}` })
    }
  }

  // ③ Sustitución — forma Mega de una especie con piedra (Megas de Champions incluidas)
  if (opts.megas) {
    let megaProposals = 0
    for (const cand of candidates.slice(0, Math.min(poolSize, 20))) {
      const stones = opts.megas[toId(cand)]
      if (!stones) continue
      for (const stone of stones) {
        if (megaProposals >= MEGA_CAP || team.some((s) => toId(s.id) === stone.forme)) continue
        megaProposals++
        for (let i = 0; i < team.length; i++) {
          const t = clones()
          t[i] = { ...representativeSet(cand, meta, dex), id: stone.forme, name: stone.formeName, item: stone.item }
          evaluate(t, { tier: "swap", kind: "swap", slot: i, change: `slot ${i + 1}: ${team[i].name ?? team[i].id} → ${stone.formeName}` })
        }
      }
    }
  }

  return { base, proposals: out.sort((a, b) => b.delta - a.delta) }
}

/** Buckets mínimos y no invasivos: primer nivel suficiente + alternativas. */
export function groupProposals(proposals: Proposal[]) {
  return {
    tune: proposals.filter((p) => p.tier === "tune"),
    remake: proposals.filter((p) => p.tier === "remake"),
    swap: proposals.filter((p) => p.tier === "swap"),
  }
}

export { toId }
