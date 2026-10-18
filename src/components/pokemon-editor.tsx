"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { FlaskConical, GripVertical, Leaf, Sparkles } from "lucide-react"
import {
  SP_MAX,
  SP_TOTAL,
  STAT_KEYS,
  abilityChoices,
  isLegalMove,
  isValidSpread,
  itemChoices,
  learnMethod,
  legalMoves,
  natureEffect,
  speciesLearnset,
  speciesOf,
  spUsed,
  statsAt50,
  suggestSpread,
  toId,
} from "@/core"
import type { Dataset, StatKey } from "@/core"
import { useTeam } from "@/lib/store"
import { CategoryBadge, MethodChip, moveStats } from "./move-common"
import { ChoiceButton, CloseButton, Combo, Field, STAT_LABEL, Pokeball, Sprite, TypeBadge } from "./ui"

const STAT_ROWS: { key: StatKey; label: string }[] = STAT_KEYS.map((key) => ({ key, label: STAT_LABEL[key] }))

export function PokemonEditor({ dataset, moveOptions }: { dataset: Dataset; moveOptions: string[] }) {
  const selected = useTeam((s) => s.selected)
  const picker = useTeam((s) => s.picker)

  return (
    <AnimatePresence>
      {selected !== null && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Cierra primero el panel lateral; si no estaba abierto, el editor.
            onClick={() => (picker !== null ? useTeam.getState().closePicker() : useTeam.getState().select(null))}
            className="fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-md"
          />
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="screen fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col gap-5 overflow-y-auto border-r border-line bg-ink-900/95 p-5 shadow-[30px_0_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl min-[736px]:max-w-[min(28rem,calc(50vw-0.5rem))] lg:max-w-md"
          >
            <EditorBody slot={selected} dataset={dataset} moveOptions={moveOptions} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function EditorBody({ slot, dataset, moveOptions }: { slot: number; dataset: Dataset; moveOptions: string[] }) {
  const { pokedex, meta, legal, learnsets, items: itemDex, moves: movesDex } = dataset
  const set = useTeam((s) => s.team[slot])
  const { update, setSp, select, openPicker } = useTeam.getState()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const species = speciesOf(pokedex, set.id)
  const stats = species ? statsAt50(species, set) : undefined
  const stats2 = isValidSpread(set)
  const used = spUsed(set)
  const remaining = SP_TOTAL - used
  const eff = natureEffect(set.nature)
  const natureText =
    !set.nature
      ? "sin elegir"
      : eff.neutral || !eff.plus || !eff.minus
        ? "neutra"
        : `${STAT_LABEL[eff.plus]} ↑ / ${STAT_LABEL[eff.minus]} ↓`
  const { base: baseItems, mega: megaItems } = itemChoices(
    set.id,
    itemDex ? Object.values(itemDex).map((i) => i.name) : [],
    meta,
    legal.megaStones,
  )
  const metaAbilities = (meta.byId[set.id]?.abilities ?? []).map((a) => a.name)
  const abilityList = species?.abilities?.length ? species.abilities : metaAbilities
  const abilityItems = abilityChoices(set.ability, abilityList)
  const learnset = speciesLearnset(set.id, learnsets)
  const legalCount = useMemo(() => legalMoves(set.id, learnsets, moveOptions).length, [set.id, learnsets, moveOptions])

  const resetMoves = () => update(slot, { attacks: [] })
  const resetSp = () => update(slot, { sp: {} })
  /** Reparto sugerido de SP según movimientos y naturaleza (sustituye el actual). */
  const applySuggestedSp = () => {
    if (!species) return
    update(slot, { sp: suggestSpread(species, set, movesDex) })
  }

  /** Reordena las ranuras de movimiento (arrastre o teclado en el asa). */
  const reorderMoves = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from > 3 || to > 3) return
    const attacks = [...set.attacks]
    while (attacks.length < 4) attacks.push("")
    const [moved] = attacks.splice(from, 1)
    attacks.splice(to, 0, moved)
    update(slot, { attacks })
  }

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Sprite name={species?.name ?? set.name ?? set.id} size={56} className="rounded-xl" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold">{species?.name ?? set.name ?? set.id}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {(species?.types ?? []).map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
          </div>
        </div>
        <CloseButton onClick={() => select(null)} label="Cerrar editor" />
      </header>

      <Field label="Especie" icon={<Pokeball size={14} />}>
        <ChoiceButton
          value={species?.name ?? set.name ?? set.id}
          placeholder="Elegir especie…"
          onClick={() => openPicker({ kind: "species", slot })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Objeto" icon={<FlaskConical aria-hidden className="h-3.5 w-3.5" />}>
          {baseItems.length + megaItems.length > 0 ? (
            <ChoiceButton value={set.item} placeholder="Elegir objeto…" onClick={() => openPicker({ kind: "item", slot })} />
          ) : (
            // Sin catálogo de objetos (p. ej. datos sin generar): no bloqueamos el campo.
            <Combo
              value={set.item ?? ""}
              options={[]}
              listId="item-list"
              onChange={(v) => update(slot, { item: v || undefined })}
              placeholder="—"
            />
          )}
        </Field>
        <Field label="Habilidad" icon={<Sparkles aria-hidden className="h-3.5 w-3.5" />}>
          {abilityItems.length > 0 ? (
            <ChoiceButton value={set.ability} placeholder="Elegir habilidad…" onClick={() => openPicker({ kind: "ability", slot })} />
          ) : (
            <Combo value={set.ability ?? ""} options={[]} listId="ability-list" onChange={(v) => update(slot, { ability: v })} placeholder="—" />
          )}
        </Field>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="label flex items-center gap-1.5">
            <Leaf aria-hidden className="h-3.5 w-3.5" />
            Naturaleza
          </span>
          <span className="text-[11px] text-faint">{natureText}</span>
        </div>
        <ChoiceButton value={set.nature} placeholder="Elegir naturaleza…" onClick={() => openPicker({ kind: "nature", slot })} />
      </div>

      <div className="surface-inset relative p-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[11px] opacity-[0.06]"
          style={{
            backgroundImage: "repeating-linear-gradient(-45deg, var(--color-fg) 0 1px, transparent 1px 7px)",
          }}
        />
        <div className="relative space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="label">Movimientos</span>
              <button
                type="button"
                onClick={resetMoves}
                title="Vaciar los movimientos"
                className="inline-flex items-center gap-1 rounded-md border border-line-2/70 bg-ink-800/70 px-2 py-0.5 font-display text-[11px] font-medium text-faint transition-colors hover:border-bad/60 hover:bg-bad/10 hover:text-bad"
              >
                <span aria-hidden className="text-[13px] leading-none">
                  ↺
                </span>
                Reset
              </button>
            </span>
            {learnset && Object.keys(learnset).length ? (
              <span className="text-[11px] text-faint">{legalCount} movimientos de la especie</span>
            ) : (
              <span className="text-[11px] text-faint">sin datos de la especie</span>
            )}
          </div>
          {[0, 1, 2, 3].map((idx) => {
            const value = set.attacks[idx] ?? ""
            const data = value ? movesDex[toId(value)] : undefined
            const method = value ? learnMethod(learnset?.[value]) : undefined
            const stats = data ? moveStats(data) : ""
            const invalid = value !== "" && !isLegalMove(set.id, value, learnsets)
            return (
              <div key={`move-${slot}-${idx}`} className="space-y-1">
                <div
                  data-move-row
                  onDragOver={(e) => {
                    if (dragIndex !== null) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = "move"
                    }
                  }}
                  onDrop={(e) => {
                    if (dragIndex === null) return
                    e.preventDefault()
                    reorderMoves(dragIndex, idx)
                    setDragIndex(null)
                  }}
                  className={`flex items-stretch gap-1.5 rounded-lg transition-opacity ${
                    dragIndex === idx ? "opacity-40" : ""
                  }`}
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(idx)
                      e.dataTransfer.effectAllowed = "move"
                      const row = e.currentTarget.parentElement
                      if (row) e.dataTransfer.setDragImage(row, 24, 24)
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" && idx > 0) {
                        e.preventDefault()
                        reorderMoves(idx, idx - 1)
                      } else if (e.key === "ArrowDown" && idx < 3) {
                        e.preventDefault()
                        reorderMoves(idx, idx + 1)
                      }
                    }}
                    title="Arrastra para reordenar (o usa ↑/↓)"
                    aria-label={`Reordenar movimiento ${idx + 1}`}
                    className="grid w-5 shrink-0 cursor-grab place-items-center rounded text-faint/70 transition-colors hover:bg-ink-800/70 hover:text-muted focus-visible:text-muted active:cursor-grabbing"
                  >
                    <GripVertical aria-hidden className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker({ kind: "move", slot, index: idx })}
                    title={value ? "Cambiar movimiento" : "Elegir movimiento"}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      invalid
                        ? "border-bad/50 bg-ink-900/60 hover:border-bad/70 hover:bg-bad/10"
                        : "border-line bg-ink-900/60 hover:border-brand/50 hover:bg-brand/5"
                    }`}
                  >
                    {value ? (
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center gap-2">
                          {data && <TypeBadge type={data.type} />}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{value}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
                          {data && <CategoryBadge category={data.category} />}
                          <MethodChip method={method} />
                          {stats && <span className="num">{stats}</span>}
                        </span>
                      </span>
                    ) : (
                      <span className="truncate text-sm text-faint">Elegir movimiento…</span>
                    )}
                  </button>
                </div>
                {invalid && (
                  <p className="text-[11px] text-bad">
                    «{value}» no lo aprende {species?.name ?? set.id}.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="label">Stat Points</span>
            <button
              type="button"
              onClick={resetSp}
              title="Vaciar el reparto de Stat Points"
              className="inline-flex items-center gap-1 rounded-md border border-line-2/70 bg-ink-800/70 px-2 py-0.5 font-display text-[11px] font-medium text-faint transition-colors hover:border-bad/60 hover:bg-bad/10 hover:text-bad"
            >
              <span aria-hidden className="text-[13px] leading-none">
                ↺
              </span>
              Reset
            </button>
            {species && (
              <button
                type="button"
                onClick={applySuggestedSp}
                title="Aplicar un reparto sugerido para su papel (sustituye el reparto actual)"
                className="inline-flex items-center gap-1 rounded-md border border-line-2/70 bg-ink-800/70 px-2 py-0.5 font-display text-[11px] font-medium text-faint transition-colors hover:border-brand/60 hover:bg-brand/10 hover:text-brand"
              >
                <Sparkles aria-hidden className="h-3 w-3" />
                Sugerido
              </button>
            )}
          </span>
          <span className="flex items-center gap-2">
            {remaining > 0 ? (
              <span className="num text-xs font-semibold text-muted">te quedan {remaining} SP</span>
            ) : remaining === 0 ? (
              <span className="num text-xs font-semibold text-brand">reparto completo</span>
            ) : (
              <span className="num text-xs font-semibold text-bad">te sobran {-remaining} SP</span>
            )}
            <span className={`num text-xs font-semibold ${stats2.ok ? "text-faint" : "text-bad"}`}>
              {used}/{SP_TOTAL}
            </span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-950 ring-1 ring-inset ring-line/70">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              stats2.ok ? "bg-gradient-to-r from-emerald-400 to-brand" : "bg-bad"
            }`}
            style={{ width: `${Math.min((used / SP_TOTAL) * 100, 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STAT_ROWS.map(({ key, label }) => {
            const value = set.sp?.[key] ?? 0
            const atCap = value >= SP_MAX
            const up = eff.plus === key
            const down = eff.minus === key
            const boxTone = up
              ? "border-brand/40 bg-brand/10"
              : down
                ? "border-bad/40 bg-bad/10"
                : atCap
                  ? "border-warn/40 bg-warn/10"
                  : "border-line bg-ink-900/40"
            const labelTone = up ? "text-brand" : down ? "text-bad" : atCap ? "text-warn" : "text-muted"
            return (
              <div key={key} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${boxTone}`}>
                <span className={`flex flex-1 items-center gap-1 text-xs ${labelTone}`}>
                  {label}
                  {up && (
                    <span aria-hidden title="La naturaleza sube esta stat" className="font-display">
                      ↑
                    </span>
                  )}
                  {down && (
                    <span aria-hidden title="La naturaleza baja esta stat" className="font-display">
                      ↓
                    </span>
                  )}
                </span>
                {stats && <span className="num w-9 text-right text-sm font-medium text-fg">{stats[key]}</span>}
                <input
                  type="number"
                  min={0}
                  max={SP_MAX}
                  value={value}
                  onChange={(e) => setSp(slot, key, Number(e.target.value))}
                  className="input w-14 px-1.5 py-0.5 text-right text-sm"
                />
              </div>
            )
          })}
        </div>
        {!eff.neutral && (
          <p className="flex items-center gap-3 text-[11px] text-faint">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-brand" aria-hidden /> sube
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-bad" aria-hidden /> baja
            </span>
            <span>por naturaleza</span>
          </p>
        )}
        {!stats2.ok && <p className="text-xs text-bad">{stats2.errors.join(" · ")}</p>}
        <p className="text-xs text-faint">
          1 SP = 1 punto a L50 · máx {SP_MAX}/stat · {SP_TOTAL} en total
        </p>
      </div>
    </>
  )
}
