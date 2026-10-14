"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { effVs, evaluateThreat, toId, type Dataset, type Matchup, type Team } from "@/core"
import type { DamageVerdict, DetailedReport, KoRace, MemberDamage } from "@/core/damage"
import { useTeam } from "@/lib/store"
import { ArrowLeftRight, Check, Minus, TriangleAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Chip, CloseButton, Hint, Sprite, TypeBadge } from "./ui"

const VERDICT: Record<DamageVerdict, { icon: string; label: string; tone: string }> = {
  counter: { icon: "✔", label: "Fuerte", tone: "text-brand" },
  koMutuo: { icon: "⇄", label: "KO mutuo", tone: "text-info" },
  neutral: { icon: "·", label: "Neutral", tone: "text-muted" },
  weak: { icon: "✖", label: "Débil", tone: "text-bad" },
}

/** Chip del motivo, con el tono y el icono del veredicto. */
const REASON_TONE: Record<DamageVerdict, string> = {
  counter: "border-brand/40 bg-brand/10 text-brand",
  koMutuo: "border-info/40 bg-info/10 text-info",
  neutral: "border-line bg-ink-900/40 text-muted",
  weak: "border-warn/40 bg-warn/10 text-warn",
}

const REASON_ICON: Record<DamageVerdict, LucideIcon> = {
  counter: Check,
  koMutuo: ArrowLeftRight,
  neutral: Minus,
  weak: TriangleAlert,
}

/** Motivo del veredicto según el daño real (el de tipos se muestra al desplegar). */
const DAMAGE_REASON: Record<DamageVerdict, string> = {
  counter: "aguanta y puede hacerle KO",
  koMutuo: "KO mutuo",
  neutral: "aguanta, pero no le hace KO",
  weak: "no aguanta sus ataques",
}

/** En un KO mutuo, quién pega primero según prioridad, velocidad y tipos. */
const KO_RACE_REASON: Record<KoRace, string> = {
  win: "ganas",
  lose: "pierdes",
}
const KO_RACE_TONE: Record<KoRace, string> = {
  win: "border-brand/40 bg-brand/10 text-brand",
  lose: "border-bad/40 bg-bad/10 text-bad",
}

/** Nota que explica la carrera del KO mutuo (va en la «i» del título). */
const KO_RACE_NOTE =
  "«KO mutuo»: quién pega primero se decide por prioridad → velocidad (con SP) → tipos; si todo empata, derrota (peor escenario). No se cuenta el speed control (Tailwind, Trick Room, Icy Wind, parálisis…)."

/** Tono de cada badge de conteo (el ✖ va en rojo). */
const COUNT_TONE: Record<DamageVerdict, string> = {
  counter: "border-brand/40 bg-brand/10 text-brand",
  koMutuo: "border-info/40 bg-info/10 text-info",
  neutral: "border-line bg-ink-900/40 text-muted",
  weak: "border-bad/40 bg-bad/10 text-bad",
}

/** Daño recibido más alto (peor movimiento de la amenaza) y daño hecho más alto. */
const worstOf = (rolls: MemberDamage["incoming"]) => {
  if (!rolls.length) return null
  const r = rolls.reduce((a, b) => (b.pctMax > a.pctMax ? b : a))
  return `${r.move} ${r.pctMin}-${r.pctMax}%`
}
const bestOf = (rolls: MemberDamage["outgoing"]) => {
  if (!rolls.length) return null
  const r = rolls.reduce((a, b) => (b.pctMax > a.pctMax ? b : a))
  return `${r.move} ${r.pctMin}-${r.pctMax}%`
}

/** Contadores por veredicto (fuerte / KO mutuo / neutral / débil) del equipo frente a la amenaza. */
function VerdictCounts({ counts }: { counts: { counter: number; koMutuo: number; neutral: number; weak: number } }) {
  const items: { key: DamageVerdict; n: number }[] = [
    { key: "counter", n: counts.counter },
    { key: "koMutuo", n: counts.koMutuo },
    { key: "neutral", n: counts.neutral },
    { key: "weak", n: counts.weak },
  ]
  return (
    <span
      className="flex items-center gap-1"
      title="Veredicto de cada integrante con daño real: fuerte / KO mutuo / neutral / débil"
    >
      {items.map(({ key, n }) => (
        <span
          key={key}
          className={`num inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold ${COUNT_TONE[key]}`}
        >
          <span aria-hidden>{VERDICT[key].icon}</span>
          {n}
        </span>
      ))}
    </span>
  )
}

const formatRoll = (r: { move: string; min: number; max: number; pctMin: number; pctMax: number; koChance: number }) => {
  const pct = `${r.pctMin}-${r.pctMax}%`
  const chance = Math.round(r.koChance * 100)
  if (r.pctMin >= 100) return `${r.move}: ${r.min}-${r.max} dmg (${pct} · KO seguro)`
  if (r.pctMax >= 100) return `${r.move}: ${r.min}-${r.max} dmg (${pct}${chance > 0 ? ` · KO ${chance}%` : ""})`
  return `${r.move}: ${r.min}-${r.max} dmg (${pct}${chance > 0 ? ` · KO ${chance}%` : ""})`
}

export function ThreatDetail({
  dataset,
  threatId,
  onClose,
}: {
  dataset: Dataset
  threatId: string | null
  onClose: () => void
}) {
  const team = useTeam((s) => s.team)
  const report = useMemo(
    () => (threatId ? evaluateThreat(team, threatId, dataset.pokedex, dataset.moves, dataset.meta) : null),
    [threatId, team, dataset],
  )
  // El daño real se calcula en el servidor (la librería no va al bundle del cliente).
  const [damage, setDamage] = useState<MemberDamage[] | null>(null)
  // Al cambiar de amenaza o de equipo, se reinicia el estado de carga durante el render.
  const [loadedFor, setLoadedFor] = useState<readonly [Team, string | null]>([team, threatId])
  if (loadedFor[0] !== team || loadedFor[1] !== threatId) {
    setLoadedFor([team, threatId])
    setDamage(null)
  }

  useEffect(() => {
    if (!threatId) return
    let cancelled = false
    fetch("/api/threat-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team, threatId }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<DetailedReport>
      })
      .then((d) => {
        if (!cancelled) setDamage(d.damage)
      })
      .catch(() => {
        if (!cancelled) setDamage([])
      })
    return () => {
      cancelled = true
    }
  }, [threatId, team])

  const bySlot = useMemo(() => new Map((damage ?? []).map((d) => [d.slot, d])), [damage])
  // "Responde" = integrantes que aguantan y pueden hacerle KO (daño real).
  const answered = useMemo(() => (damage ? damage.filter((d) => d.answers).length : null), [damage])
  // ¿Algún movimiento del equipo golpea súper efectivo a la amenaza? (cobertura ofensiva).
  const hasSe = useMemo(() => {
    if (!report) return true
    return team.some((s) =>
      (s.attacks ?? []).some((name) => {
        const m = dataset.moves[toId(name)]
        return !!m && m.category !== "Status" && m.basePower > 0 && effVs(m.type, report.types) >= 2
      }),
    )
  }, [team, report, dataset.moves])
  const counts = useMemo(() => {
    const src: DamageVerdict[] = damage ? damage.map((d) => d.verdict) : (report?.matchups.map((m) => m.verdict) ?? [])
    return {
      total: src.length,
      counter: src.filter((v) => v === "counter").length,
      koMutuo: src.filter((v) => v === "koMutuo").length,
      neutral: src.filter((v) => v === "neutral").length,
      weak: src.filter((v) => v === "weak").length,
    }
  }, [damage, report])

  return (
    <AnimatePresence>
      {report && (
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
            className="surface accent-glass fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(40rem,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-x-hidden overflow-y-auto p-5 pt-6"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
                <Sprite name={report.name} size={44} className="row-span-2 rounded-lg" />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <h2 className="truncate font-display text-base font-semibold sm:text-lg">{report.name}</h2>
                  <div className="flex shrink-0 items-center gap-2">
                    {answered !== null && (
                      <Chip
                        tone={answered ? "brand" : "bad"}
                        title="Integrantes que aguantan sus ataques y pueden hacerle KO (con daño real)"
                      >
                        Responde {answered}/{counts.total}
                      </Chip>
                    )}
                    {!hasSe && (
                      <Chip
                        tone="warn"
                        title="Ningún movimiento del equipo le golpea súper efectivo: para hacerle KO dependes de daño neutro"
                      >
                        Sin golpe SE
                      </Chip>
                    )}
                    <CloseButton onClick={onClose} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {report.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                  <span className="ml-1 text-xs text-faint">{report.usage}% de uso</span>
                </div>
              </div>

              <div className="surface-inset p-3.5 text-sm">
                <h3 className="label mb-2">Set más común</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {report.commonSet.item && <span>Objeto: <span className="text-fg">{report.commonSet.item}</span></span>}
                  {report.commonSet.ability && <span>Hab.: <span className="text-fg">{report.commonSet.ability}</span></span>}
                  {report.commonSet.nature && <span>Naturaleza: <span className="text-fg">{report.commonSet.nature}</span></span>}
                </div>
                <div className="mt-2 overflow-hidden rounded-xl border border-line-2/70 bg-ink-950/60">
                  <div className="flex items-center gap-2 border-b border-line/60 bg-ink-900/40 px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-faint">movimientos</span>
                  </div>
                  <ul className="divide-y divide-line/40">
                    {report.commonSet.moves.map((m) => {
                      const t = dataset.moves[toId(m)]?.type
                      return (
                        <li key={m} className="flex items-center gap-2.5 px-3 py-1.5">
                          {t ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/types/${t.toLowerCase()}.svg`}
                              alt=""
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                          ) : (
                            <span className="w-4 shrink-0 text-center text-faint">–</span>
                          )}
                          <span className="font-mono text-xs text-fg">{m}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1">
                    <h3 className="label">Tu equipo frente a esta amenaza</h3>
                    <Hint text={KO_RACE_NOTE} align="start" />
                  </span>
                  {damage === null ? (
                    <span className="text-[10px] text-faint">calculando daño real…</span>
                  ) : (
                    <VerdictCounts counts={counts} />
                  )}
                </div>
                <ul className="space-y-1.5">
                  {report.matchups.map((m) => (
                    <MatchupRow key={m.slot} matchup={m} dmg={bySlot.get(m.slot)} />
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** Fila compacta de un miembro frente a la amenaza; el daño real se despliega al pulsar. */
function MatchupRow({ matchup: m, dmg }: { matchup: Matchup; dmg?: MemberDamage }) {
  const [open, setOpen] = useState(false)
  // Con el daño real cargado, su veredicto manda (el de tipos es la previsualización).
  const verdict = dmg?.verdict ?? m.verdict
  const v = VERDICT[verdict]
  const ReasonIcon = REASON_ICON[verdict]
  const edge =
    verdict === "counter"
      ? "border-l-brand"
      : verdict === "koMutuo"
        ? "border-l-info"
        : verdict === "weak"
          ? "border-l-bad"
          : "border-l-line-2"
  // En un KO mutuo el motivo indica quién pega primero (prioridad/velocidad/tipos; empate = derrota).
  const race = dmg?.verdict === "koMutuo" ? (dmg.koRace ?? "lose") : null
  const reason = dmg ? (race ? KO_RACE_REASON[race] : DAMAGE_REASON[dmg.verdict]) : m.reason
  const reasonTone = race ? KO_RACE_TONE[race] : REASON_TONE[verdict]
  const inc = dmg ? worstOf(dmg.incoming) : null
  const out = dmg ? bestOf(dmg.outgoing) : null
  return (
    <li className={`surface-inset border-l-2 ${edge} text-sm`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left"
      >
        <span className={`w-4 shrink-0 text-center font-bold ${v.tone}`}>{v.icon}</span>
        <Sprite name={m.name} size={28} className="rounded-md" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-fg">{m.name}</span>
            <span className="flex shrink-0 gap-1">
              {m.types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight">
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px ${reasonTone}`}>
              <ReasonIcon aria-hidden className="h-3 w-3 shrink-0" />
              {reason}
            </span>
          </span>
          {(inc || out) && (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight">
              {inc && <span className="text-faint" title="Peor movimiento de la amenaza">recibe {inc}</span>}
              {out && <span className="text-faint" title="Mejor movimiento del integrante">· hace {out}</span>}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-xs font-medium ${v.tone}`}>{v.label}</span>
        <span aria-hidden className={`shrink-0 text-faint transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>
      {open && (
        <div className="border-t border-line/70 px-2.5 py-2 pl-9">
          <p className="text-[11px] text-faint">
            <span className="text-faint/70">Según tipos: </span>
            {m.reason}
          </p>
          {dmg ? (
            <div className="mt-2 rounded-lg border border-line-2 bg-ink-950/40 px-2.5 py-2 text-[11px] leading-snug">
              <div className="space-y-0.5">
                {dmg.incoming.length > 0 ? (
                  dmg.incoming.map((r) => (
                    <div key={`in-${r.move}`} className="flex gap-2">
                      <span className="w-12 shrink-0 text-faint">recibe</span>
                      <span className="min-w-0 flex-1">
                        <span className={r.pctMin >= 100 ? "text-bad" : r.pctMax >= 100 ? "text-warn" : "text-muted"}>
                          {formatRoll(r)}
                        </span>
                        {r.coverage && (
                          <span className="ml-1.5 rounded border border-warn/40 bg-warn/10 px-1 text-[9px] uppercase tracking-wide text-warn">
                            cobertura
                          </span>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex gap-2">
                    <span className="w-12 shrink-0 text-faint">recibe</span>
                    <span className="text-faint">no usa ataques de daño</span>
                  </div>
                )}
                {dmg.outgoing.map((r) => (
                  <div key={`out-${r.move}`} className="flex gap-2">
                    <span className="w-12 shrink-0 text-faint">hace</span>
                    <span
                      className={
                        r.pctMin >= 100 ? "text-brand" : r.pctMin >= 50 || r.koChance >= 0.5 ? "text-emerald-300" : "text-muted"
                      }
                    >
                      {formatRoll(r)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 border-t border-line/40 pt-1.5 text-[10px] leading-snug text-faint">
                «recibe»: sus 4 ataques de daño más usados del meta · «cobertura»: movimiento fuera del set mostrado.
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] text-faint">calculando daño real…</p>
          )}
        </div>
      )}
    </li>
  )
}
