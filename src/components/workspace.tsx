"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import type { Analysis, Dataset, Proposal } from "@/core"
import { useTeam } from "@/lib/store"
import { CompareDialog } from "./compare-dialog"
import { DiagnosisPanel } from "./diagnosis-panel"
import { ImportExportDialog, type DialogKind } from "./import-export-dialog"
import { PokemonEditor } from "./pokemon-editor"
import { PickerPanel } from "./picker-panel"
import { TeamPanel } from "./team-panel"
import { ThreatDetail } from "./threat-detail"
import { Button, Chip, Pokeball } from "./ui"

/**
 * Fecha de la ingesta del meta en formato corto y estable (UTC), para que no
 * haya desajuste de hidratación entre servidor y cliente.
 */
function formatMetaDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d)
}

export function Workspace({ dataset }: { dataset: Dataset }) {
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [threatId, setThreatId] = useState<string | null>(null)
  const [comparison, setComparison] = useState<{ proposal: Proposal; base: Analysis } | null>(null)
  const reset = useTeam((s) => s.reset)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  // Vuelve a ingerir los datos base (Showdown) y el meta (Limitless) sin
  // redeploy: pide la revalidación y luego refresca el componente de servidor
  // (RSC) para traer el dato nuevo.
  async function refreshData() {
    if (busy || pending) return
    setBusy(true)
    try {
      const res = await fetch("/api/refresh", { method: "POST" })
      if (res.ok) startTransition(() => router.refresh())
    } catch {
      // sin red: se conservan los datos actuales
    } finally {
      setBusy(false)
    }
  }
  const refreshing = busy || pending

  // Rehidrata el equipo guardado en localStorage tras montar (SSR estable).
  useEffect(() => {
    void useTeam.persist.rehydrate()
  }, [])

  const moveOptions = useMemo(() => {
    const moves = new Set<string>()
    for (const m of Object.values(dataset.moves)) if (m.name) moves.add(m.name)
    return [...moves].sort()
  }, [dataset])

  const metaDate = formatMetaDate(dataset.meta.generatedAt)

  return (
    <>
      {/* Barra de progreso fina: realimentación no destructiva mientras se
          re-ingiere base + meta. El contenido se mantiene y solo se atenúa. */}
      {refreshing && (
        <motion.div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden">
          <motion.div
            className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand to-transparent"
            animate={{ x: ["-100%", "400%"] }}
            transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
          />
        </motion.div>
      )}
      <main
        className={`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-5 transition-opacity duration-300 lg:p-8 ${
          refreshing ? "pointer-events-none opacity-60" : "opacity-100"
        }`}
      >
        <header className="surface accent-glass rise flex flex-wrap items-center justify-between gap-3 p-4 pt-5 sm:gap-4 sm:p-5 sm:pt-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand/30 bg-gradient-to-br from-brand/25 via-brand/5 to-info/15 shadow-[0_0_28px_-6px_rgba(61,220,151,0.65)]">
            <Pokeball size={28} label="PokeArmony" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold leading-none tracking-tight">PokeArmony</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip tone="info">Reg {dataset.meta.format}</Chip>
              <span className="num text-[11px] tracking-wide text-faint">
                {dataset.meta.teams} equipos
                <span className="hidden sm:inline">
                  <span className="mx-1.5 text-line-2">{"//"}</span>
                  {dataset.meta.tournaments} torneos
                </span>
                {metaDate && (
                  <span className="hidden lg:inline">
                    <span className="mx-1.5 text-line-2">{"//"}</span>
                    actualizado {metaDate}
                  </span>
                )}
                <span className="blink ml-1.5 text-brand">▍</span>
              </span>
              <button
                type="button"
                onClick={refreshData}
                disabled={refreshing}
                title="Vuelve a descargar y agregar los datos base (Showdown) y el meta (Limitless), sin desplegar"
                className="inline-flex items-center gap-1 rounded-md border border-line-2/70 bg-ink-800/70 px-2 py-0.5 font-display text-[11px] font-medium tracking-wide text-faint transition-colors hover:border-brand/60 hover:bg-brand/10 hover:text-brand disabled:cursor-wait disabled:opacity-60"
              >
                <span aria-hidden className={`text-[13px] leading-none ${refreshing ? "animate-spin" : ""}`}>↻</span>
                <span className="hidden lg:inline">{refreshing ? "Actualizando…" : "Actualizar datos"}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialog("import")}>Importar</Button>
          <Button onClick={() => setDialog("export")}>Exportar</Button>
          <Button variant="subtle" onClick={reset}>
            Reiniciar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        {/* El equipo queda anclado mientras la columna de análisis hace scroll. */}
        <div className="lg:sticky lg:top-8">
          <TeamPanel dataset={dataset} />
        </div>
        <DiagnosisPanel dataset={dataset} onOpenThreat={setThreatId} onCompare={(p, base) => setComparison({ proposal: p, base })} />
      </div>

      <footer className="surface-inset mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-3 text-xs text-faint min-[736px]:flex-nowrap">
        <span className="hidden min-w-0 min-[736px]:inline min-[736px]:flex-1 min-[736px]:truncate">
          <span aria-hidden className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand align-middle shadow-[0_0_8px_rgba(61,220,151,0.9)]" />
          Los cambios se recalculan al instante y se guardan en tu navegador.
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="num text-[11px] tracking-wide text-faint">
            Diseñado y desarrollado por{" "}
            <span className="font-semibold text-brand">YerayD</span>
            <span className="blink ml-1 text-brand">▍</span>
          </span>
          <Pokeball size={16} className="hidden shrink-0 opacity-60 md:inline" />
        </span>
      </footer>

      <PokemonEditor dataset={dataset} moveOptions={moveOptions} />
      <PickerPanel dataset={dataset} moveOptions={moveOptions} />
      <ImportExportDialog dataset={dataset} kind={dialog} onClose={() => setDialog(null)} />
      <ThreatDetail dataset={dataset} threatId={threatId} onClose={() => setThreatId(null)} />
      <CompareDialog dataset={dataset} comparison={comparison} onClose={() => setComparison(null)} />
      </main>
    </>
  )
}
