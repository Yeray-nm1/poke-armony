"use client"

import { useMemo } from "react"
import { AnimatePresence, motion } from "motion/react"
import { speciesOf, type Analysis, type Proposal } from "@/core"
import type { Dataset, TeamSet } from "@/core"
import { useTeam } from "@/lib/store"
import { Button, CloseButton, METRIC_LABEL, TierBadge } from "./ui"

const round = (n: number) => Math.round(n * 100)

/**
 * Comparador antes/después. Recibe el análisis base (con daño real, del
 * servidor) y usa el `after` ya re-puntuado de la propuesta, de modo que las
 * cifras coinciden exactamente con el ranking del panel.
 */
export function CompareDialog({
  dataset,
  comparison,
  onClose,
}: {
  dataset: Dataset
  comparison: { proposal: Proposal; base: Analysis } | null
  onClose: () => void
}) {
  const team = useTeam((s) => s.team)
  const applySet = useTeam((s) => s.applySet)
  const proposal = comparison?.proposal ?? null

  const view = useMemo(() => {
    if (!comparison) return null
    const { proposal: p, base } = comparison
    return { before: base, after: p.after, current: team[p.slot], proposal: p }
  }, [comparison, team])

  const apply = () => {
    if (!proposal) return
    applySet(proposal.slot, proposal.nextSet)
    onClose()
  }

  return (
    <AnimatePresence>
      {view && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-md"
          />
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="surface accent-glass fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(36rem,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 pt-6"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-semibold">Comparar cambio</h2>
                    <TierBadge tier={view.proposal.tier} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Ranura {view.proposal.slot + 1} · {view.proposal.change}
                  </p>
                </div>
                <CloseButton onClick={onClose} />
              </div>

              {view.proposal.tier === "remake" && (
                <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                  Mismo Pokémon, otro rol. Se conservan tus Stat Points: reajústalos al nuevo rol.
                </p>
              )}

              <div className="surface-inset flex items-center justify-center gap-5 p-4">
                <div className="text-center">
                  <div className="num text-2xl font-semibold text-muted">{view.before.harmony}</div>
                  <div className="label mt-1">Antes</div>
                </div>
                <div className="text-2xl text-faint">→</div>
                <div className="text-center">
                  <div className="num text-3xl font-bold text-brand">{view.after.harmony}</div>
                  <div className="label mt-1">Después</div>
                </div>
                <div className="num ml-1 rounded-lg border border-brand/40 bg-brand/12 px-2.5 py-1 text-sm font-semibold text-brand">
                  +{view.proposal.delta}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="label">Métricas del equipo</h3>
                <ul className="space-y-1.5">
                  {(Object.keys(view.after.metrics) as (keyof Analysis["metrics"])[]).map((k) => {
                    const b = round(view.before.metrics[k])
                    const a = round(view.after.metrics[k])
                    const diff = a - b
                    return (
                      <li key={k} className="flex items-center gap-3 text-xs">
                        <span className="flex-1 text-muted">{METRIC_LABEL[k] ?? k}</span>
                        <span className="num tabular-nums text-faint">{b}%</span>
                        <span className="text-faint">→</span>
                        <span className="num tabular-nums text-fg">{a}%</span>
                        <span
                          className={`num w-12 text-right tabular-nums font-semibold ${
                            diff > 0 ? "text-brand" : diff < 0 ? "text-bad" : "text-faint"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="label">Set de la ranura</h3>
                <SetDiff
                  before={view.current}
                  after={view.proposal.nextSet}
                  nameOf={(id) => speciesOf(dataset.pokedex, id)?.name ?? id}
                  emphasis={view.proposal.tier === "remake" ? ["Naturaleza", "Habilidad"] : view.proposal.tier === "swap" ? ["Especie"] : undefined}
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button variant="primary" onClick={apply}>
                  Aplicar al equipo
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function SetDiff({
  before,
  after,
  nameOf,
  emphasis,
}: {
  before: TeamSet
  after: TeamSet
  nameOf: (id: string) => string
  /** Filas que definen el cambio de rol/especie; se resaltan si cambian. */
  emphasis?: string[]
}) {
  const rows: { label: string; from: string; to: string }[] = [
    { label: "Especie", from: nameOf(before.id), to: nameOf(after.id) },
    { label: "Objeto", from: before.item ?? "—", to: after.item ?? "—" },
    { label: "Habilidad", from: before.ability ?? "—", to: after.ability ?? "—" },
    { label: "Naturaleza", from: before.nature ?? "—", to: after.nature ?? "—" },
    {
      label: "Movimientos",
      from: before.attacks.filter(Boolean).join(", ") || "—",
      to: after.attacks.filter(Boolean).join(", ") || "—",
    },
  ]
  return (
    <ul className="surface-inset space-y-1 px-3 py-2.5 text-xs">
      {rows.map((r) => {
        const changed = r.from !== r.to
        const hot = changed && !!emphasis?.includes(r.label)
        return (
          <li key={r.label} className="flex gap-3">
            <span className={`w-24 shrink-0 ${hot ? "font-medium text-warn" : "text-faint"}`}>
              {r.label}
              {hot && <span className="ml-1 text-[10px] uppercase tracking-wide opacity-80">rol</span>}
            </span>
            <span className="min-w-0 flex-1">
              {changed ? (
                <>
                  <span className="text-faint line-through">{r.from}</span>{" "}
                  <span className="text-fg">{r.to}</span>
                </>
              ) : (
                <span className="text-muted">{r.from}</span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
