"use client"

import { Fragment, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  NATURE_NAMES,
  STAT_KEYS,
  TYPES,
  abilityChoices,
  itemChoices,
  learnMethod,
  legalMoves,
  natureEffect,
  reconcileSpeciesChange,
  speciesLearnset,
  speciesOf,
  toId,
} from "@/core"
import type { Dataset, SpeciesData, StatKey } from "@/core"
import { useTeam, type Picker } from "@/lib/store"
import { CATEGORY_LABEL, CategoryBadge, MethodChip, moveStats, type MoveOption } from "./move-common"
import { CloseButton, Select, STAT_LABEL, Sprite, TypeBadge } from "./ui"

const CATEGORIES = ["Physical", "Special", "Status"] as const
/** Stats que una naturaleza puede subir (PS nunca). */
const NATURE_STATS: StatKey[] = STAT_KEYS.filter((k) => k !== "hp")
/** Abreviatura de cada stat para la línea compacta del selector de especie. */
const STAT_SHORT: Record<StatKey, string> = {
  hp: "PS",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
}
/** Etiquetas de objeto para filtrar (orden de los chips). Solo efecto + familia Mega. */
const ITEM_TAGS: { id: string; label: string }[] = [
  { id: "ofensivo", label: "Ofensivo" },
  { id: "defensivo", label: "Defensivo" },
  { id: "curacion", label: "Curación" },
  { id: "velocidad", label: "Velocidad" },
  { id: "apoyo", label: "Apoyo" },
  { id: "mega", label: "Mega" },
]

/**
 * Panel lateral derecho para elegir un campo del set (movimiento, objeto,
 * habilidad o naturaleza), con el mismo patrón: cabecera, búsqueda, filtros y
 * una lista. Al elegir, se rellena el campo y el panel se cierra.
 */
export function PickerPanel({ dataset, moveOptions }: { dataset: Dataset; moveOptions: string[] }) {
  const picker = useTeam((s) => s.picker)

  return (
    <AnimatePresence>
      {picker && (
        <motion.aside
          key="picker"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") useTeam.getState().closePicker()
          }}
          className="screen fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-line bg-ink-900/95 shadow-[-30px_0_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl min-[736px]:max-w-[min(28rem,calc(50vw-0.5rem))] lg:max-w-md"
        >
          <PickerBody
            key={`${picker.kind}-${picker.slot}-${picker.index ?? ""}`}
            picker={picker}
            dataset={dataset}
            moveOptions={moveOptions}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function PickerBody({ picker, dataset, moveOptions }: { picker: Picker; dataset: Dataset; moveOptions: string[] }) {
  const set = useTeam((s) => s.team[picker.slot])
  const species = speciesOf(dataset.pokedex, set.id)
  const { closePicker } = useTeam.getState()
  const name = species?.name ?? set.name ?? set.id

  const titles: Record<Picker["kind"], string> = {
    move: "Elegir movimiento",
    item: "Elegir objeto",
    ability: "Elegir habilidad",
    nature: "Elegir naturaleza",
    species: "Elegir especie",
  }
  const subtitle =
    picker.kind === "move"
      ? `Ranura ${(picker.index ?? 0) + 1} · ${name}`
      : picker.kind === "species"
        ? "Cambiar reinicia habilidad, objeto y movimientos"
        : name

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-line p-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold">{titles[picker.kind]}</h2>
          <p className="mt-0.5 truncate text-xs text-faint">{subtitle}</p>
        </div>
        <CloseButton onClick={closePicker} label="Cerrar panel" />
      </header>

      {picker.kind === "move" ? (
        <MoveBody slot={picker.slot} index={picker.index ?? 0} dataset={dataset} moveOptions={moveOptions} />
      ) : picker.kind === "item" ? (
        <ItemBody slot={picker.slot} dataset={dataset} />
      ) : picker.kind === "ability" ? (
        <AbilityBody slot={picker.slot} dataset={dataset} />
      ) : picker.kind === "nature" ? (
        <NatureBody slot={picker.slot} />
      ) : (
        <SpeciesBody slot={picker.slot} dataset={dataset} />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Piezas compartidas                                                  */
/* ------------------------------------------------------------------ */

function toggleIn(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

function Filters({ children }: { children: ReactNode }) {
  return <div className="space-y-3 border-b border-line p-4">{children}</div>
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      autoFocus
      className="input"
    />
  )
}

function FilterChip({ label, on, onClick, title }: { label: string; on: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 font-display text-[11px] font-medium transition-colors ${
        on ? "border-brand/60 bg-brand/15 text-brand" : "border-line-2/70 bg-ink-800/70 text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  )
}

function UsageBadge({ pct }: { pct?: number }) {
  if (pct == null) return null
  return <span className="num shrink-0 rounded bg-white/10 px-1.5 py-px text-[10px] text-zinc-200">{pct.toFixed(1)}%</span>
}

function ActualBadge() {
  return <span className="shrink-0 rounded bg-brand/15 px-1 py-px text-[10px] text-brand">actual</span>
}

/** Fila "vaciar" al principio de la lista (solo si hay un valor puesto). */
function ClearRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li className="mb-1 border-b border-line/70 pb-1">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-bad/10"
      >
        <span
          aria-hidden
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] text-faint"
        >
          —
        </span>
        <span className="text-sm text-muted">{label}</span>
      </button>
    </li>
  )
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul role="listbox" aria-label="Opciones" className="flex-1 overflow-y-auto p-2">
      {children}
    </ul>
  )
}

function EmptyRow() {
  return <li className="px-3 py-6 text-center text-sm text-faint">Sin resultados.</li>
}

/* ------------------------------------------------------------------ */
/* Movimientos                                                         */
/* ------------------------------------------------------------------ */

function MoveBody({
  slot,
  index,
  dataset,
  moveOptions,
}: {
  slot: number
  index: number
  dataset: Dataset
  moveOptions: string[]
}) {
  const { learnsets, moves: movesDex } = dataset
  const set = useTeam((s) => s.team[slot])
  const { setMove, closePicker } = useTeam.getState()
  const learnset = speciesLearnset(set.id, learnsets)
  const current = set.attacks[index] ?? ""

  const [query, setQuery] = useState("")
  const [cats, setCats] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])

  const all = useMemo<MoveOption[]>(
    () =>
      legalMoves(set.id, learnsets, moveOptions).map((name) => {
        const data = movesDex[toId(name)]
        return {
          name,
          type: data?.type,
          category: data?.category,
          basePower: data?.basePower,
          accuracy: data?.accuracy,
          shortDesc: data?.shortDesc,
          method: learnMethod(learnset?.[name]),
        }
      }),
    [set.id, learnsets, moveOptions, movesDex, learnset],
  )

  const usedElsewhere = useMemo(
    () => new Set(set.attacks.filter((_, i) => i !== index).map((m) => toId(m)).filter(Boolean)),
    [set.attacks, index],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (o) =>
        !usedElsewhere.has(toId(o.name)) &&
        (!q || o.name.toLowerCase().includes(q)) &&
        (!cats.length || (!!o.category && cats.includes(o.category))) &&
        (!types.length || (!!o.type && types.includes(o.type))),
    )
  }, [all, query, cats, types, usedElsewhere])

  const hasFilters = query.trim() !== "" || cats.length > 0 || types.length > 0
  const clearFilters = () => {
    setQuery("")
    setCats([])
    setTypes([])
  }

  function pick(o: MoveOption) {
    setMove(slot, index, o.name)
    closePicker()
  }
  function clear() {
    setMove(slot, index, "")
    closePicker()
  }

  return (
    <>
      <Filters>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre…" />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <FilterChip key={c} label={CATEGORY_LABEL[c]} on={cats.includes(c)} onClick={() => setCats((l) => toggleIn(l, c))} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.includes(t)}
              title={t}
              onClick={() => setTypes((l) => toggleIn(l, t))}
              className={`rounded transition ${
                types.includes(t) ? "ring-2 ring-brand/70" : "opacity-45 grayscale hover:opacity-90 hover:grayscale-0"
              }`}
            >
              <TypeBadge type={t} />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-faint">
          <span className="num">
            {filtered.length} de {all.length}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-line-2/70 bg-ink-800/70 px-2 py-0.5 transition-colors hover:border-brand/50 hover:text-fg"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </Filters>

      <List>
        {current && <ClearRow label="Vaciar ranura" onClick={clear} />}
        {filtered.length === 0 ? (
          <EmptyRow />
        ) : (
          filtered.map((o) => {
            const isCurrent = o.name === current
            return (
              <li key={o.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => pick(o)}
                  className={`flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors ${
                    isCurrent ? "bg-brand/10" : "hover:bg-ink-900/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <TypeBadge type={o.type ?? ""} />
                    <span className="truncate text-sm font-medium text-fg">{o.name}</span>
                    {isCurrent && <ActualBadge />}
                    <span className="num ml-auto shrink-0 text-[10px] text-faint">{moveStats(o)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-faint">
                    <CategoryBadge category={o.category} />
                    <MethodChip method={o.method} />
                    {o.shortDesc && <span className="min-w-0 flex-1 truncate">{o.shortDesc}</span>}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </List>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Objetos                                                             */
/* ------------------------------------------------------------------ */

function ItemBody({ slot, dataset }: { slot: number; dataset: Dataset }) {
  const { meta, legal, items: itemDex } = dataset
  const set = useTeam((s) => s.team[slot])
  const { update, closePicker } = useTeam.getState()

  const itemNames = useMemo(() => Object.values(itemDex ?? {}).map((i) => i.name), [itemDex])
  const { base, mega } = useMemo(
    () => itemChoices(set.id, itemNames, meta, legal.megaStones),
    [set.id, itemNames, meta, legal.megaStones],
  )
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of meta.byId[set.id]?.items ?? []) m.set(i.name.toLowerCase(), i.pct)
    return m
  }, [meta, set.id])

  const [query, setQuery] = useState("")
  const [tags, setTags] = useState<string[]>([])

  const current = set.item ?? ""
  const options = useMemo(() => {
    const list = [...base.map((name) => ({ name, mega: false })), ...mega.map((name) => ({ name, mega: true }))]
    // Objeto antiguo que ya no está en el catálogo: se antepone para no perderlo.
    if (current && !list.some((o) => o.name === current)) list.unshift({ name: current, mega: false })
    return list
  }, [base, mega, current])

  const q = query.trim().toLowerCase()
  const filtered = options.filter((o) => {
    const itemTags = itemDex?.[toId(o.name)]?.tags ?? []
    const tagOk = !tags.length || tags.some((t) => itemTags.includes(t))
    return tagOk && (!q || o.name.toLowerCase().includes(q))
  })

  function pick(name: string) {
    update(slot, { item: name || undefined })
    closePicker()
  }

  return (
    <>
      <Filters>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar objeto…" />
        <div className="flex flex-wrap gap-1.5">
          {ITEM_TAGS.map((t) => (
            <FilterChip key={t.id} label={t.label} on={tags.includes(t.id)} onClick={() => setTags((l) => toggleIn(l, t.id))} />
          ))}
        </div>
        <div className="num text-[11px] text-faint">
          {filtered.length} de {options.length}
        </div>
      </Filters>

      <List>
        {current && <ClearRow label="Sin objeto" onClick={() => pick("")} />}
        {filtered.length === 0 ? (
          <EmptyRow />
        ) : (
          filtered.map((o) => {
            const isCurrent = o.name === current
            const data = itemDex?.[toId(o.name)]
            return (
              <li key={o.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => pick(o.name)}
                  className={`flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors ${
                    isCurrent ? "bg-brand/10" : "hover:bg-ink-900/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{o.name}</span>
                    {isCurrent && <ActualBadge />}
                    <UsageBadge pct={usage.get(o.name.toLowerCase())} />
                  </span>
                  {data?.shortDesc && <span className="text-[11px] leading-snug text-faint">{data.shortDesc}</span>}
                </button>
              </li>
            )
          })
        )}
      </List>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Habilidades                                                         */
/* ------------------------------------------------------------------ */

function AbilityBody({ slot, dataset }: { slot: number; dataset: Dataset }) {
  const { pokedex, meta } = dataset
  const set = useTeam((s) => s.team[slot])
  const { update, closePicker } = useTeam.getState()
  const species = speciesOf(pokedex, set.id)

  const metaAbilities = useMemo(() => (meta.byId[set.id]?.abilities ?? []).map((a) => a.name), [meta, set.id])
  const hidden = useMemo(() => new Set(species?.hiddenAbilities ?? []), [species])
  const list = useMemo(() => {
    const base = species?.abilities?.length ? species.abilities : metaAbilities
    return abilityChoices(set.ability, base)
  }, [species, metaAbilities, set.ability])
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of meta.byId[set.id]?.abilities ?? []) m.set(a.name.toLowerCase(), a.pct)
    return m
  }, [meta, set.id])

  const [query, setQuery] = useState("")
  const current = set.ability ?? ""
  const q = query.trim().toLowerCase()
  const filtered = list.filter((a) => !q || a.toLowerCase().includes(q))

  function pick(a: string) {
    update(slot, { ability: a || undefined })
    closePicker()
  }

  return (
    <>
      <Filters>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar habilidad…" />
        <div className="num text-[11px] text-faint">
          {filtered.length} de {list.length}
        </div>
      </Filters>

      <List>
        {current && <ClearRow label="Sin habilidad" onClick={() => pick("")} />}
        {filtered.length === 0 ? (
          <EmptyRow />
        ) : (
          filtered.map((a) => {
            const isCurrent = a === current
            return (
              <li key={a}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => pick(a)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                    isCurrent ? "bg-brand/10" : "hover:bg-ink-900/60"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{a}</span>
                  {hidden.has(a) && (
                    <span className="shrink-0 rounded-full bg-violet-400/15 px-1.5 py-px text-[10px] text-violet-200">Hidden</span>
                  )}
                  {isCurrent && <ActualBadge />}
                  <UsageBadge pct={usage.get(a.toLowerCase())} />
                </button>
              </li>
            )
          })
        )}
      </List>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Naturalezas                                                         */
/* ------------------------------------------------------------------ */

function NatureBody({ slot }: { slot: number }) {
  const set = useTeam((s) => s.team[slot])
  const { update, closePicker } = useTeam.getState()
  const natures = useMemo(
    () =>
      NATURE_NAMES.map((n) => {
        const e = natureEffect(n)
        return { name: n, neutral: e.neutral || !e.plus || !e.minus, plus: e.plus, minus: e.minus }
      }),
    [],
  )

  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<string[]>([])

  const current = set.nature ?? ""
  const q = query.trim().toLowerCase()
  const filtered = natures.filter((o) => {
    if (filters.length) {
      const neutralOn = filters.includes("neutral")
      const plusOk = o.plus ? filters.includes(o.plus) : false
      if (!((o.neutral && neutralOn) || (!o.neutral && plusOk))) return false
    }
    return !q || o.name.toLowerCase().includes(q)
  })

  function pick(n: string) {
    update(slot, { nature: n || undefined })
    closePicker()
  }

  return (
    <>
      <Filters>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar naturaleza…" />
        <div className="flex flex-wrap gap-1.5">
          {NATURE_STATS.map((k) => (
            <FilterChip key={k} label={`${STAT_LABEL[k]} ↑`} on={filters.includes(k)} onClick={() => setFilters((l) => toggleIn(l, k))} />
          ))}
          <FilterChip label="Neutras" on={filters.includes("neutral")} onClick={() => setFilters((l) => toggleIn(l, "neutral"))} />
        </div>
        <div className="num text-[11px] text-faint">
          {filtered.length} de {natures.length}
        </div>
      </Filters>

      <List>
        {current && <ClearRow label="Sin naturaleza" onClick={() => pick("")} />}
        {filtered.length === 0 ? (
          <EmptyRow />
        ) : (
          filtered.map((o) => {
            const isCurrent = o.name === current
            return (
              <li key={o.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => pick(o.name)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                    isCurrent ? "bg-brand/10" : "hover:bg-ink-900/60"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{o.name}</span>
                  {isCurrent && <ActualBadge />}
                  <span className="shrink-0 text-[11px] text-faint">
                    {o.neutral ? "neutra" : `${STAT_LABEL[o.plus as StatKey]} ↑ / ${STAT_LABEL[o.minus as StatKey]} ↓`}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </List>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Especie                                                             */
/* ------------------------------------------------------------------ */

function SpeciesBody({ slot, dataset }: { slot: number; dataset: Dataset }) {
  const { pokedex, legal, meta } = dataset
  const set = useTeam((s) => s.team[slot])
  const { update, closePicker } = useTeam.getState()

  // Roster legal si lo hay; si no, todo el pokédex.
  const all = useMemo(() => {
    const ids = legal.legal.length ? legal.legal : Object.keys(pokedex)
    return ids
      .map((id) => {
        const s = speciesOf(pokedex, id)
        return s
          ? {
              id,
              name: s.name ?? id,
              types: s.types,
              baseStats: s.baseStats,
              abilities: s.abilities ?? [],
              hidden: s.hiddenAbilities ?? [],
            }
          : undefined
      })
      .filter(
        (
          o,
        ): o is {
          id: string
          name: string
          types: string[]
          baseStats: SpeciesData["baseStats"]
          abilities: string[]
          hidden: string[]
        } => !!o,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [legal.legal, pokedex])

  const [query, setQuery] = useState("")
  const [types, setTypes] = useState<string[]>([])
  const [ability, setAbility] = useState("")

  // Habilidades presentes en el roster (incluidas las ocultas), ordenadas.
  const allAbilities = useMemo(
    () => [...new Set(all.flatMap((o) => o.abilities))].sort((a, b) => a.localeCompare(b)),
    [all],
  )

  const current = set.id
  const q = query.trim().toLowerCase()
  const filtered = all.filter(
    (o) =>
      (!types.length || o.types.some((t) => types.includes(t))) &&
      (!ability || o.abilities.includes(ability)) &&
      (!q || o.name.toLowerCase().includes(q)),
  )

  function pick(id: string) {
    const next = speciesOf(pokedex, id)
    update(slot, {
      id,
      name: next?.name ?? id,
      attacks: [],
      ...reconcileSpeciesChange(set, id, { abilities: next?.abilities ?? [], meta, megaStones: legal.megaStones }),
    })
    closePicker()
  }

  return (
    <>
      <Filters>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar especie…" />
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.includes(t)}
              title={t}
              onClick={() => setTypes((l) => toggleIn(l, t))}
              className={`rounded transition ${
                types.includes(t) ? "ring-2 ring-brand/70" : "opacity-45 grayscale hover:opacity-90 hover:grayscale-0"
              }`}
            >
              <TypeBadge type={t} />
            </button>
          ))}
        </div>
        <Select value={ability} onChange={setAbility} className="text-xs">
          <option value="">Todas las habilidades</option>
          {allAbilities.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <div className="num text-[11px] text-faint">
          {filtered.length} de {all.length}
        </div>
      </Filters>

      <List>
        {filtered.length === 0 ? (
          <EmptyRow />
        ) : (
          filtered.map((o) => {
            const isCurrent = o.id === current
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => pick(o.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                    isCurrent ? "bg-brand/10" : "hover:bg-ink-900/60"
                  }`}
                >
                  <Sprite name={o.name} size={32} className="shrink-0 rounded-md" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{o.name}</span>
                      {o.types.map((t) => (
                        <TypeBadge key={t} type={t} />
                      ))}
                    </span>
                    <span className="num grid grid-cols-6 gap-x-1 text-[11px] text-muted">
                      {STAT_KEYS.map((k) => (
                        <span key={k} className="whitespace-nowrap">
                          <span className="text-faint">{STAT_SHORT[k]}</span> {o.baseStats?.[k] ?? "—"}
                        </span>
                      ))}
                    </span>
                    {o.abilities.length > 0 && (
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight">
                        <span className="shrink-0 rounded border border-info/40 bg-info/15 px-1.5 py-px font-display text-[10px] font-semibold text-info">
                          Ability
                        </span>
                        {o.abilities.map((a, i) => {
                          const isHidden = o.hidden.includes(a)
                          return (
                            <Fragment key={a}>
                              {i > 0 && <span aria-hidden className="select-none text-faint/60">·</span>}
                              <span
                                title={isHidden ? "Habilidad oculta" : undefined}
                                className={isHidden ? "text-violet-200/90" : "text-muted"}
                              >
                                {a}
                                {isHidden && <sup className="ml-px text-[8px] font-semibold">H</sup>}
                              </span>
                            </Fragment>
                          )
                        })}
                      </span>
                    )}
                  </span>
                  {isCurrent && <ActualBadge />}
                </button>
              </li>
            )
          })
        )}
      </List>
    </>
  )
}
