"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { groupProposals, harmonyFromMetrics, proposeEdits, speciesOf, speedProfile, toId, weakestMetrics, type Analysis, type Field, type MissingField, type Proposal, type Team } from "@/core"
import type { Dataset } from "@/core"
import { useTeam } from "@/lib/store"
import { Button, Gauge, Hint, METRIC_HINT, METRIC_LABEL, MetricBar, MetricIcon, Panel, SectionTitle, TIER_META, TierBadge, TypeBadge, VulnerableTypes } from "./ui"

const FIELD_LABEL: Record<Field, string> = {
  none: "Sin control",
  tailwind: "Tailwind",
  trickroom: "Trick Room",
}

const FIELD_HINT: Record<Field, string> = {
  none: "Carrera base, sin control de velocidad. Si el setter cae, esto es lo que tienes.",
  tailwind: "Con Tailwind activo: tu velocidad se duplica.",
  trickroom: "Con Trick Room activo: el eje se invierte y gana el más lento.",
}

/** Nombre legible de lo que le falta a un set, para el aviso de sets a medias. */
const MISSING_LABEL: Record<MissingField, string> = {
  sp: "SP sin repartir",
  item: "sin objeto",
  nature: "sin naturaleza",
}

/** Velocidad que entra en la comparación con el escenario activo (Tailwind ×2). */
const effectiveSpeed = (mine: number, field: Field) => (field === "tailwind" ? mine * 2 : mine)

/**
 * Margen de velocidad A TU FAVOR en el escenario activo: positivo ⇒ actúas antes.
 * - Sin control / Tailwind: tu velocidad (×2 con TW) menos la de la amenaza.
 * - Trick Room: se invierte el eje, así que el margen es amenaza − tú (el lento va antes).
 * Así el signo siempre concuerda con el veredicto «actúa antes / después».
 */
const speedMargin = (mine: number, opp: number, field: Field) =>
  field === "trickroom" ? opp - mine : effectiveSpeed(mine, field) - opp

/** Nota corta del escenario activo para la comparativa. */
const SCENARIO_NOTE: Record<Field, string> = {
  none: "Sin control de velocidad.",
  tailwind: "Con Tailwind tu velocidad se duplica.",
  trickroom: "Con Trick Room actúa antes el más lento.",
}

export function DiagnosisPanel({
  dataset,
  onOpenThreat,
  onCompare,
}: {
  dataset: Dataset
  onOpenThreat: (id: string) => void
  onCompare: (p: Proposal, base: Analysis) => void
}) {
  const team = useTeam((s) => s.team)
  // Diferimos el cálculo pesado para que escribir en el editor siga siendo fluido.
  const deferredTeam = useDeferredValue(team)
  const applySet = useTeam((s) => s.applySet)

  // Vista previa local (por tipos): instantánea, se muestra mientras el servidor
  // re-puntúa con daño real.
  const local = useMemo(
    () => proposeEdits(deferredTeam, dataset.pokedex, dataset.moves, dataset.meta, {
      legal: dataset.legal.legal,
      megas: dataset.legal.megaStones,
    }),
    [deferredTeam, dataset],
  )

  // Recomendaciones con DAÑO real (servidor). Se adoptan solo si corresponden al
  // equipo vigente; si no, se sigue mostrando la vista previa local.
  const [refined, setRefined] = useState<{ team: Team; analysis: Analysis; proposals: Proposal[] } | null>(null)
  const [tab, setTab] = useState<"suggestions" | "threats">("suggestions")
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team: deferredTeam }),
        signal: controller.signal,
      })
        .then((r) =>
          r.ok ? (r.json() as Promise<{ analysis: Analysis; proposals: Proposal[] }>) : Promise.reject(new Error(String(r.status))),
        )
        .then((d) => setRefined({ team: deferredTeam, analysis: d.analysis, proposals: d.proposals }))
        .catch(() => {})
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [deferredTeam])

  const authoritative = refined && refined.team === deferredTeam ? refined : null
  const analysis = authoritative?.analysis ?? local.base
  const proposals = authoritative?.proposals ?? local.proposals
  const refining = authoritative === null
  const { tune, remake, swap } = useMemo(() => groupProposals(proposals), [proposals])

  // Escenario de campo (Velocidad). El toggle solo cambia qué escenario precalculado
  // se muestra; la armonía se recompone con la velocidad elegida, sin recalcular.
  const [field, setField] = useState<Field>("none")
  const available = useMemo<Field[]>(() => {
    const mv = new Set(deferredTeam.flatMap((s) => s.attacks ?? []))
    return ["none", ...(mv.has("Tailwind") ? (["tailwind"] as const) : []), ...(mv.has("Trick Room") ? (["trickroom"] as const) : [])]
  }, [deferredTeam])
  const activeField = available.includes(field) ? field : "none"
  // Carrera de velocidad (ancla = miembro más lento). Se calcula por stats, igual
  // en cliente y servidor, así que la vista previa local ya es fiel sin esperar al
  // daño real. De aquí salen los 3 escenarios y el desglose por amenaza.
  const speed = useMemo(
    () => speedProfile(deferredTeam, dataset.pokedex, dataset.meta),
    [deferredTeam, dataset],
  )
  // Compatibilidad por parejas (pura, por movimientos/habilidad/objeto/tipos):
  // el detalle explicable que sustituye a la antigua métrica de Sinergia. Vive en
  // la card «Tu equipo» (vista de foco), no aquí.
  const fields = speed.scenarios
  const metrics = useMemo(
    () => ({ ...analysis.metrics, speed: fields[activeField] }),
    [analysis.metrics, fields, activeField],
  )
  const harmony = useMemo(() => harmonyFromMetrics(metrics), [metrics])
  const weakest = useMemo(() => weakestMetrics(metrics), [metrics])

  // Desglose de la carrera, ordenado por uso (lo que más pesa en la métrica).
  const race = useMemo(() => [...speed.threats].sort((a, b) => b.pct - a.pct), [speed])

  // Extremos del equipo para la línea de resumen (banda, sin mediana).
  const slowMember = speed.members.length ? speed.members[speed.members.length - 1] : null
  const fastMember = speed.members.length ? speed.members[0] : null

  // Sets a medias (SP sin repartir del todo, objeto o naturaleza sin elegir) y su
  // detalle para el tooltip, agrupado por lo que falta.
  const incomplete = speed.members.filter((m) => m.missing.length > 0)
  const incompleteHint =
    `Piezas a las que les falta algo por configurar — ${(["sp", "item", "nature"] as MissingField[])
      .map((k) => {
        const names = incomplete.filter((m) => m.missing.includes(k)).map((m) => m.name)
        return names.length ? `${MISSING_LABEL[k]}: ${names.join(", ")}` : null
      })
      .filter(Boolean)
      .join(" · ")}. Su velocidad puede ser baja solo por eso, sin que sea una decisión.`

  // Amenaza elegida en el desglose de velocidad (por defecto, la más usada).
  const [raceThreat, setRaceThreat] = useState<string | null>(null)
  const selectedThreat = race.find((t) => t.id === raceThreat) ?? race[0] ?? null

  const unanswered = useMemo(() => new Set(analysis.unanswered.map(toId)), [analysis.unanswered])
  const nameOf = (id: string) => speciesOf(dataset.pokedex, id)?.name ?? id

  const threats = useMemo(
    () => dataset.meta.usage.slice(0, 10).filter((u) => speciesOf(dataset.pokedex, u.id)),
    [dataset],
  )

  const apply = (p: Proposal) => applySet(p.slot, p.nextSet)

  return (
    <section className="rise space-y-6 [animation-delay:140ms]">
      <Panel className="space-y-5">
        <SectionTitle
          right={
            refining ? (
              <span
                className="flex items-center gap-1.5 text-[10px] text-faint"
                title="El servidor está recalculando la armonía con daño real (motor del juego)…"
              >
                <span aria-hidden className="h-1.5 w-1.5 animate-ping rounded-full bg-warn" />
                calculando daño real…
              </span>
            ) : null
          }
        >
          Diagnóstico
        </SectionTitle>

        <div className="space-y-3 border-t border-line/70 pt-4">
          <span className="label text-muted">Resumen</span>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <Gauge value={harmony / 100} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-3xl font-bold leading-none text-fg">{harmony}</span>
              <span className="label mt-1">/ 100</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <p className="text-sm text-muted">
              Puntos débiles:{" "}
              <span className="font-medium text-warn">
                {weakest.map((k) => METRIC_LABEL[k] ?? k).join(", ") || "ninguno"}
              </span>
            </p>
            {analysis.unanswered.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-faint">Sin respuesta a:</span>
                {analysis.unanswered.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenThreat(id)}
                    className="rounded-md border border-bad/35 bg-bad/12 px-1.5 py-0.5 text-bad transition-colors hover:bg-bad/20"
                  >
                    {nameOf(id)}
                  </button>
                ))}
              </div>
            )}
            {analysis.offenseGaps.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5 text-xs"
                title="Amenazas del meta a las que ningún movimiento del equipo golpea súper efectivo (aunque puedas hacerles KO con daño neutro)"
              >
                <span className="text-faint">Sin golpe súper efectivo:</span>
                {analysis.offenseGaps.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenThreat(id)}
                    className="rounded-md border border-warn/35 bg-warn/12 px-1.5 py-0.5 text-warn transition-colors hover:bg-warn/20"
                  >
                    {nameOf(id)}
                  </button>
                ))}
              </div>
            )}
            {analysis.roleFocus.plans.map((plan) => {
              const failed = plan.checks.filter((c) => !c.ok)
              return (
                <div
                  key={plan.id}
                  className="flex flex-wrap items-center gap-1.5 text-xs"
                  title={plan.checks.map((c) => c.label).join(" · ")}
                >
                  <span className="text-faint">{plan.label}:</span>
                  {failed.length === 0 ? (
                    <span className="rounded-md border border-brand/35 bg-brand/12 px-1.5 py-0.5 text-brand">
                      bien sostenido
                    </span>
                  ) : (
                    failed.map((c) => (
                      <span
                        key={c.label}
                        className="rounded-md border border-warn/35 bg-warn/12 px-1.5 py-0.5 text-warn"
                      >
                        {c.label}
                      </span>
                    ))
                  )}
                </div>
              )
            })}
            {analysis.roleFocus.speedControl && (
              <p className="text-xs text-muted">
                <span className="text-faint">Control de velocidad: </span>
                presente (lo puntúa Velocidad)
              </p>
            )}
          </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-line/70 pt-4">
          <span className="label text-muted">Métricas de armonía</span>
          <div className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
          {Object.entries(metrics)
            // La velocidad no se muestra aquí: su detalle vive en «Carrera de velocidad».
            .filter(([k]) => k !== "speed")
            .map(([k, v]) => (
            <MetricBar
              key={k}
              label={METRIC_LABEL[k] ?? k}
              hint={METRIC_HINT[k]}
              value={v}
              invert={k === "redundancy"}
              icon={<MetricIcon metric={k} />}
            />
          ))}
          </div>

          <div className="space-y-1.5 border-t border-line/70 pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="label text-muted">Velocidad</span>
                <Hint text={METRIC_HINT.speed} />
              </span>
              {available.length > 1 ? (
                <div
                  role="radiogroup"
                  aria-label="Escenario de campo para la velocidad"
                  className="flex items-center gap-0.5 rounded-lg border border-line-2/70 bg-ink-950/60 p-0.5"
                >
                  {available.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={activeField === f}
                      onClick={() => setField(f)}
                      title={FIELD_HINT[f]}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        activeField === f
                          ? "bg-brand/15 text-brand shadow-[inset_0_0_0_1px_rgba(61,220,151,0.35)]"
                          : "text-muted hover:bg-ink-800/60 hover:text-fg"
                      }`}
                    >
                      {f === "none" ? null : <MetricIcon metric="speed" />}
                      {FIELD_LABEL[f]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-faint">añade Tailwind o Trick Room para ver otros escenarios</span>
              )}
            </div>
            {speed.teamSize > 0 ? (
              <>
                {slowMember && fastMember && (
                  <p className="text-xs text-muted">
                    Rango del equipo: <span className="text-fg">{slowMember.name}</span>{" "}
                    <span className="num text-faint">{slowMember.speed}</span>
                    {" – "}
                    <span className="text-fg">{fastMember.name}</span>{" "}
                    <span className="num text-faint">{fastMember.speed}</span>
                  </p>
                )}
                <details className="group">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[11px] text-faint transition-colors hover:text-muted [&::-webkit-details-marker]:hidden">
                    <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    Ver desglose · {speed.teamSize} piezas y {race.length} amenazas
                  </summary>
                  <div className="mt-2.5 space-y-3">
                    <div>
                      <p className="label mb-1.5 text-muted">Por pieza · % del meta que adelanta</p>
                      <ul className="space-y-1">
                        {speed.members.map((m) => {
                          const cov = m.coverage[activeField]
                          return (
                            <li key={m.id} className="flex items-center gap-2">
                              <span className="w-24 shrink-0 truncate text-xs text-fg" title={m.name}>
                                {m.name}
                              </span>
                              <span className="num w-7 shrink-0 text-right text-[11px] text-faint">{m.speed}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-950 ring-1 ring-inset ring-line/70">
                                <span
                                  className="block h-full rounded-full bg-brand transition-[width] duration-500"
                                  style={{ width: `${Math.max(cov * 100, 2)}%` }}
                                />
                              </span>
                              <span className="num w-8 shrink-0 text-right text-[11px] text-muted">
                                {Math.round(cov * 100)}%
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                      {incomplete.length > 0 && (
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-faint">
                          <span className="text-warn">
                            Falta completar el set en {incomplete.length} de {speed.teamSize} Pokémon
                          </span>
                          <Hint text={incompleteHint} align="start" />
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="label mb-1.5 text-muted">
                        Por amenaza · cuántas de tus {speed.teamSize} la superan
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {race.map((t) => {
                          const b = t.beats[activeField]
                          const isSelected = selectedThreat?.id === t.id
                          const tone =
                            b === 0
                              ? "border-bad/35 bg-bad/12 text-bad hover:bg-bad/20"
                              : b === speed.teamSize
                                ? "border-brand/35 bg-brand/12 text-brand hover:bg-brand/20"
                                : "border-warn/35 bg-warn/12 text-warn hover:bg-warn/20"
                          return (
                            <button
                              key={t.id}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setRaceThreat(t.id)}
                              title={`${t.name} · velocidad ${t.speed} · uso ${t.pct}% — ${b}/${speed.teamSize} de tu equipo le gana la carrera`}
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${tone} ${
                                isSelected ? "ring-2 ring-fg/35" : ""
                              }`}
                            >
                              {t.name} <span className="num font-semibold">{b}/{speed.teamSize}</span>
                            </button>
                          )
                        })}
                      </div>
                      {selectedThreat && (
                        <div className="mt-2 rounded-lg border border-line/70 bg-ink-950/40 p-2">
                          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                            <span className="text-fg">{selectedThreat.name}</span>
                            <span className="num text-faint">{selectedThreat.speed}</span>
                            <span className="text-faint">· uso {selectedThreat.pct}%</span>
                          </p>
                          <p className="mt-0.5 text-[10px] text-faint">{SCENARIO_NOTE[activeField]}</p>
                          <div className="mt-1.5 flex items-center gap-2 text-[9px] uppercase tracking-wide text-faint/70">
                            <span className="w-20 shrink-0">Pieza</span>
                            <span className="w-8 shrink-0 text-right">Vel.</span>
                            <span className="w-12 shrink-0 text-right">Ventaja</span>
                            <span className="flex-1" />
                          </div>
                          <ul className="space-y-0.5">
                            {speed.members.map((m) => {
                              const margin = speedMargin(m.speed, selectedThreat.speed, activeField)
                              const ahead = margin > 0
                              return (
                                <li key={m.id} className="flex items-center gap-2 text-[11px]">
                                  <span className="w-20 shrink-0 truncate text-fg" title={m.name}>
                                    {m.name}
                                  </span>
                                  <span className="num w-8 shrink-0 text-right text-muted">
                                    {effectiveSpeed(m.speed, activeField)}
                                  </span>
                                  <span className={`num w-12 shrink-0 text-right ${ahead ? "text-brand" : "text-bad"}`}>
                                    {margin > 0 ? `+${margin}` : margin}
                                  </span>
                                  <span className={`flex-1 ${ahead ? "text-brand" : "text-bad"}`}>
                                    {ahead ? "actúa antes" : "actúa después"}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </>
            ) : (
              <p className="text-xs text-faint">Añade miembros al equipo para medir la carrera.</p>
            )}
          </div>
        </div>

        <div className="surface-inset relative p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[11px] opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, var(--color-fg) 0 1px, transparent 1px 7px)",
            }}
          />
          <div className="relative">
            <VulnerableTypes coverage={analysis.typeCoverage} />
          </div>
        </div>
      </Panel>

      <Panel className="space-y-4">
        {/* Pestañas: compactan la derecha; solo se renderiza la sección activa. */}
        <div role="tablist" aria-label="Análisis del equipo" className="flex rounded-lg border border-line-2/70 bg-ink-950/60 p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "suggestions"}
            onClick={() => setTab("suggestions")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-display text-xs font-semibold tracking-wide transition-colors ${
              tab === "suggestions"
                ? "bg-brand/15 text-brand shadow-[inset_0_0_0_1px_rgba(61,220,151,0.35)]"
                : "text-muted hover:bg-ink-800/60 hover:text-fg"
            }`}
          >
            Sugerencias
            <span
              aria-hidden
              className={`grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] leading-none ${
                tab === "suggestions" ? "bg-brand/20 text-brand" : "bg-ink-800 text-muted"
              }`}
            >
              {proposals.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "threats"}
            onClick={() => setTab("threats")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-display text-xs font-semibold tracking-wide transition-colors ${
              tab === "threats"
                ? "bg-brand/15 text-brand shadow-[inset_0_0_0_1px_rgba(61,220,151,0.35)]"
                : "text-muted hover:bg-ink-800/60 hover:text-fg"
            }`}
          >
            Amenazas
            <span
              aria-hidden
              className={`grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] leading-none ${
                tab === "threats" ? "bg-brand/20 text-brand" : "bg-ink-800 text-muted"
              }`}
            >
              {threats.length}
            </span>
          </button>
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {tab === "suggestions" ? (
            <div className="space-y-4">
              <p className="text-xs text-faint">Mejoras por Δ armonía, de la menos a la más invasiva: ① ajuste → ② rehacer → ③ sustituir.</p>
              {proposals.length === 0 && (
                <p className="text-sm text-muted">El equipo ya está afinado frente al meta: no hay mejoras claras.</p>
              )}

              <ProposalGroup tier="tune" items={tune} onApply={apply} onCompare={(p) => onCompare(p, analysis)} />
              <ProposalGroup tier="remake" items={remake} onApply={apply} onCompare={(p) => onCompare(p, analysis)} />
              <ProposalGroup tier="swap" items={swap} onApply={apply} onCompare={(p) => onCompare(p, analysis)} />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-faint">Toca una amenaza para ver el detalle (daño real).</p>
              <div className="flex items-center justify-between px-2.5 text-[10px] uppercase tracking-[0.18em] text-faint">
                <span>Amenaza</span>
                <span title="Presencia de la amenaza en el meta (top 10 de torneos)">Uso</span>
              </div>
              <ul className="space-y-1">
                {threats.map((u) => {
                  const answered = !unanswered.has(toId(u.id))
                  const types = speciesOf(dataset.pokedex, u.id)?.types ?? []
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => onOpenThreat(u.id)}
                        className="group flex w-full flex-col gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-line hover:bg-ink-800/60 sm:flex-row sm:items-center sm:gap-3"
                      >
                        {/* Nombre + tipos (línea propia en móvil, columna flexible en sm+) */}
                        <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${
                              answered ? "bg-brand/15 text-brand" : "bg-bad/15 text-bad"
                            }`}
                            title={
                              answered
                                ? "Alguien del equipo la aguanta y puede hacerle KO (con daño real)"
                                : "Nadie del equipo responde (con daño real)"
                            }
                          >
                            {answered ? "✔" : "✖"}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate text-fg">{u.name}</span>
                            <span className="flex shrink-0 gap-1">
                              {types.map((t) => (
                                <TypeBadge key={t} type={t} />
                              ))}
                            </span>
                          </span>
                        </span>
                        {/* Uso: barra a lo ancho en móvil; barra + % a la derecha en sm+ */}
                        <span className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                          <span
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-950 ring-1 ring-inset ring-line/60 sm:w-16 sm:flex-none"
                            title="Uso en el meta"
                          >
                            <span className="block h-full rounded-full bg-info/70" style={{ width: `${Math.min(u.pct, 100)}%` }} />
                          </span>
                          <span className="num w-12 shrink-0 text-right text-xs text-faint">{u.pct}%</span>
                        </span>
                        <span aria-hidden className="hidden text-faint opacity-0 transition-opacity group-hover:opacity-100 sm:inline">
                          ›
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </motion.div>
      </Panel>
    </section>
  )
}

function ProposalGroup({
  tier,
  items,
  onApply,
  onCompare,
}: {
  tier: Proposal["tier"]
  items: Proposal[]
  onApply: (p: Proposal) => void
  onCompare: (p: Proposal) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <TierBadge tier={tier} />
        <span className="text-[11px] text-faint">{TIER_META[tier].hint}</span>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 4).map((p, i) => (
          <li
            key={`${p.slot}-${p.kind}-${i}`}
            className="group flex items-start gap-3 rounded-xl border border-line bg-ink-900/40 p-2.5 transition-colors hover:border-line-2 hover:bg-ink-800/60"
          >
            <button
              type="button"
              onClick={() => onCompare(p)}
              className="flex flex-1 items-start gap-3 text-left"
              title="Comparar antes de aplicar"
            >
              <span className="num mt-0.5 shrink-0 rounded-lg border border-brand/40 bg-brand/12 px-2 py-0.5 text-xs font-semibold text-brand">
                +{p.delta}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">{p.change}</span>
                {p.fixes.length > 0 && (
                  <span className="mt-0.5 block text-xs text-muted">
                    ↑ {p.fixes.map((f) => METRIC_LABEL[f] ?? f).join(", ")}
                  </span>
                )}
              </span>
            </button>
            <Button variant="ghost" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => onApply(p)}>
              Aplicar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
