"use client"

// Sprites e iconos de tipo: <img> nativo a propósito (assets pequeños,
// locales o de CDN de Showdown) — la optimización de next/image no aporta aquí.
/* eslint-disable @next/next/no-img-element */

import { useState } from "react"
import type { ReactNode } from "react"
import { ChevronDown, Info, Layers, Shield, ShieldCheck, Sparkles, Swords, Timer, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { StatKey, Tier, TypeCoverage } from "@/core"

/** Nombre visible de cada estadística. */
export const STAT_LABEL: Record<StatKey, string> = {
  hp: "PS",
  atk: "Ataque",
  def: "Defensa",
  spa: "At. Esp.",
  spd: "Def. Esp.",
  spe: "Velocidad",
}

/** Superficie principal del panel. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`surface accent-glass p-4 sm:p-5 ${className ?? ""}`}>{children}</section>
}

/** Cabecera de sección con marca de acento (color por defecto: marca). */
export function SectionTitle({ children, right, tone }: { children: ReactNode; right?: ReactNode; tone?: string }) {
  const color = tone ?? "var(--color-brand)"
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="label flex items-center gap-2 text-muted">
        <span
          aria-hidden
          className="inline-block h-3.5 w-1 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
        />
        {children}
      </h2>
      {right}
    </div>
  )
}

/** Pokéball en SVG, para la marca y los motivos de la interfaz. */
export function Pokeball({ size = 26, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="50" cy="50" r="45" fill="#e8eef6" />
      <path d="M5 50a45 45 0 0 1 90 0z" fill="#ee4b4b" />
      <rect x="5" y="45.5" width="90" height="9" fill="#10161f" />
      <circle cx="50" cy="50" r="14" fill="#10161f" />
      <circle cx="50" cy="50" r="9" fill="#e8eef6" />
      <circle cx="50" cy="50" r="45" fill="none" stroke="#10161f" strokeWidth="6" />
    </svg>
  )
}

export function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}

/** Input con autocompletado nativo (datalist). */
export function Combo({
  value,
  onChange,
  options,
  listId,
  placeholder,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  listId: string
  placeholder?: string
  invalid?: boolean
}) {
  return (
    <>
      <input
        list={listId}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input${invalid ? " invalid" : ""}`}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
}

/** Desplegable nativo con el icono ⏷ separado del borde del campo. */
export function Select({
  value,
  onChange,
  children,
  className,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input appearance-none pr-9 ${className ?? ""}`}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
      />
    </div>
  )
}

/** Botón que abre el panel lateral de selección; imita el aspecto de un campo. */
export function ChoiceButton({
  value,
  placeholder,
  onClick,
  disabled,
  children,
}: {
  value?: string
  placeholder: string
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`input flex items-center justify-between gap-2 text-left ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {value ? <span className="truncate">{value}</span> : <span className="truncate text-faint">{placeholder}</span>}
        {children}
      </span>
      {!disabled && <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-faint" />}
    </button>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
  )
}

export const METRIC_LABEL: Record<string, string> = {
  defense: "Defensa",
  offense: "Cobertura ofensiva",
  threatClosure: "Cierre de amenazas",
  roles: "Foco del equipo",
  speed: "Velocidad",
  synergy: "Sinergia",
  redundancy: "Redundancia",
}

/** Icono por categoría de armonía. */
export const METRIC_ICON: Record<string, LucideIcon> = {
  defense: Shield,
  offense: Swords,
  threatClosure: ShieldCheck,
  roles: Users,
  speed: Timer,
  synergy: Sparkles,
  redundancy: Layers,
}

export function MetricIcon({ metric, className }: { metric: string; className?: string }) {
  const Icon = METRIC_ICON[metric]
  if (!Icon) return null
  return <Icon aria-hidden className={`h-3.5 w-3.5 ${className ?? ""}`} strokeWidth={2} />
}

/** Icono "i" en superíndice con tooltip CSS instantáneo (sin el retardo de los tooltips nativos). */
export function Hint({
  text,
  className,
  align = "end",
}: {
  text: string
  className?: string
  /** "end" lo ancla a la derecha (se abre hacia la izquierda); "start" lo ancla a la izquierda. */
  align?: "start" | "end"
}) {
  return (
    <span className={`group/tip relative flex shrink-0 self-start ${className ?? ""}`}>
      <Info aria-hidden className="h-3 w-3 cursor-help text-faint/60 transition-colors group-hover/tip:text-muted" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-30 mb-1.5 w-80 rounded-lg border border-line-2 bg-ink-800 px-3 py-2 text-left text-xs font-normal leading-snug text-fg opacity-0 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.9)] transition-opacity duration-150 group-hover/tip:opacity-100 ${
          align === "start" ? "left-0" : "right-0"
        }`}
      >
        {text}
      </span>
    </span>
  )
}

/** Explicación corta de cada categoría (tooltip). */
export const METRIC_HINT: Record<string, string> = {
  defense: "Resistencia a los ataques del meta y debilidades apiladas",
  offense: "Daño súper efectivo que el equipo puede hacer a las amenazas del meta",
  threatClosure: "Amenazas del meta a las que el equipo puede responder: resistir sus ataques y golpearlas súper efectivo",
  roles: "Qué plan declara el equipo (Trick Room, ritmo rápido, clima, terreno, seteo…) y cuán bien lo sostiene. No penaliza por no tener un rol concreto.",
  speed: "Por cada amenaza del top, cuántos de tus miembros están por encima en velocidad. El selector de campo cambia el escenario: sin control, Tailwind ×2 o Trick Room invertido.",
  synergy: "Sinergias entre miembros: clima/terreno + movimiento, Fake Out + seteo, redirección + seteo",
  redundancy: "Solapamiento de roles y tipos entre miembros — cuanto menos, mejor",
}

/** Metadatos de los niveles de recomendación (① ajuste → ③ sustitución). */
export const TIER_META: Record<Tier, { n: string; label: string; hint: string }> = {
  tune: { n: "①", label: "Ajuste", hint: "mismo set · item / movimiento" },
  remake: { n: "②", label: "Rehacer", hint: "mismo Pokémon · otro rol" },
  swap: { n: "③", label: "Sustitución", hint: "otra especie" },
}

const TIER_TONE: Record<Tier, string> = {
  tune: "border-brand/40 bg-brand/12 text-brand",
  remake: "border-warn/40 bg-warn/12 text-warn",
  swap: "border-info/40 bg-info/12 text-info",
}

export function TierBadge({ tier }: { tier: Tier }) {
  const m = TIER_META[tier]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-display text-[10px] font-semibold tracking-wide ${TIER_TONE[tier]}`}
    >
      <span aria-hidden>{m.n}</span>
      {m.label}
    </span>
  )
}

const TYPE_TONE: Record<string, string> = {
  Normal: "border-zinc-400/30 bg-zinc-400/15 text-zinc-200",
  Fire: "border-orange-400/35 bg-orange-500/18 text-orange-200",
  Water: "border-sky-400/35 bg-sky-500/18 text-sky-200",
  Electric: "border-yellow-400/35 bg-yellow-500/18 text-yellow-200",
  Grass: "border-green-400/35 bg-green-500/18 text-green-200",
  Ice: "border-cyan-400/35 bg-cyan-500/18 text-cyan-200",
  Fighting: "border-red-400/35 bg-red-500/18 text-red-200",
  Poison: "border-purple-400/35 bg-purple-500/18 text-purple-200",
  Ground: "border-amber-500/35 bg-amber-600/18 text-amber-200",
  Flying: "border-indigo-400/35 bg-indigo-400/18 text-indigo-200",
  Psychic: "border-pink-400/35 bg-pink-500/18 text-pink-200",
  Bug: "border-lime-400/35 bg-lime-600/18 text-lime-200",
  Rock: "border-stone-400/35 bg-stone-500/18 text-stone-200",
  Ghost: "border-violet-400/35 bg-violet-500/18 text-violet-200",
  Dragon: "border-blue-400/35 bg-blue-600/18 text-blue-200",
  Dark: "border-neutral-400/30 bg-neutral-500/18 text-neutral-200",
  Steel: "border-slate-300/35 bg-slate-400/18 text-slate-100",
  Fairy: "border-rose-300/40 bg-rose-400/18 text-rose-200",
}

/** Color plano (hex) por tipo, para acentos estructurales (bordes, barras, halos). */
export const TYPE_COLOR: Record<string, string> = {
  Normal: "#9fa19f",
  Fire: "#e6641e",
  Water: "#2f8fe0",
  Electric: "#f0c020",
  Grass: "#4bb04b",
  Ice: "#69d3d3",
  Fighting: "#d3425f",
  Poison: "#a45fa4",
  Ground: "#c9a227",
  Flying: "#7f9ce0",
  Psychic: "#e8608c",
  Bug: "#8fb81e",
  Rock: "#b8a038",
  Ghost: "#7b62a3",
  Dragon: "#7038f8",
  Dark: "#6b5848",
  Steel: "#8fa9c0",
  Fairy: "#ee99ac",
}

/** Color de acento para el/los tipos de una especie (o la marca si no se conoce). */
export function typeColor(types?: string[], fallback = "#3ddc97"): string {
  const t = types?.find((x) => x in TYPE_COLOR)
  return t ? (TYPE_COLOR[t] as string) : fallback
}

export function TypeBadge({ type, className, title }: { type: string; className?: string; title?: string }) {
  const known = type in TYPE_TONE
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-display text-[10px] font-medium tracking-wide ${
        TYPE_TONE[type] ?? "border-line-2 bg-ink-700/60 text-muted"
      } ${className ?? ""}`}
    >
      {known && <img src={`/types/${type.toLowerCase()}.svg`} alt="" className="h-3.5 w-3.5 object-contain" />}
      {type}
    </span>
  )
}

/** Sprite gen5 de Showdown (CDN) con respaldo discreto si no carga. */
export function Sprite({
  name,
  size = 40,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const file = name.toLowerCase().replace(/ /g, "-")
  if (broken) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-lg border border-line-2/70 bg-ink-800/80 font-display font-semibold text-muted ${className ?? ""}`}
        style={{ width: size, height: size }}
      >
        {name.trim().charAt(0)?.toUpperCase() ?? "?"}
      </span>
    )
  }
  return (
    <img
      src={`https://play.pokemonshowdown.com/sprites/gen5/${file}.png`}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={`shrink-0 object-contain ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  )
}

/** Etiqueta compacta de estado. */
export function Chip({
  children,
  tone = "default",
  className,
  title,
}: {
  children: ReactNode
  tone?: "default" | "brand" | "warn" | "bad" | "info"
  className?: string
  title?: string
}) {
  const tones = {
    default: "border-line-2 bg-ink-800/70 text-muted",
    brand: "border-brand/40 bg-brand/12 text-brand",
    warn: "border-warn/40 bg-warn/12 text-warn",
    bad: "border-bad/40 bg-bad/12 text-bad",
    info: "border-info/40 bg-info/12 text-info",
  }
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className ?? ""}`}>
      {children}
    </span>
  )
}

const toneForValue = (pct: number, invert = false) => {
  if (invert) return pct <= 20 ? "good" : pct <= 40 ? "mid" : "bad"
  return pct >= 80 ? "good" : pct >= 60 ? "mid" : "bad"
}

export function MetricBar({
  label,
  value,
  invert,
  icon,
  hint,
}: {
  label: string
  value: number
  invert?: boolean
  icon?: ReactNode
  hint?: string
}) {
  const pct = Math.round(value * 100)
  const tone = toneForValue(pct, invert)
  const fill =
    tone === "good"
      ? "from-emerald-400 to-brand"
      : tone === "mid"
        ? "from-amber-400 to-warn"
        : "from-rose-400 to-bad"
  const valueTone = tone === "good" ? "text-brand" : tone === "mid" ? "text-warn" : "text-bad"
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          {icon && <span className="shrink-0 text-faint">{icon}</span>}
          <span className="truncate text-muted">{label}</span>
          {hint && <Hint text={hint} />}
        </span>
        <span className={`num shrink-0 text-xs font-semibold ${valueTone}`}>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-950 ring-1 ring-inset ring-line/70">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${fill} transition-[width] duration-500 ease-out`}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  )
}

/** Medidor circular para la armonía global. */
export function Gauge({ value, size = 116, stroke = 10 }: { value: number; size?: number; stroke?: number }) {
  const pct = Math.max(0, Math.min(1, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = pct >= 0.8 ? "#3ddc97" : pct >= 0.6 ? "#fbbf24" : "#fb7185"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ filter: `drop-shadow(0 0 7px ${color}66)`, transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  )
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  className,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "ghost" | "primary" | "subtle" | "danger"
  className?: string
}) {
  const variants = {
    primary:
      "bg-gradient-to-b from-brand to-emerald-500 text-emerald-950 shadow-[0_10px_24px_-12px_rgba(61,220,151,0.85)] hover:from-emerald-300 hover:to-emerald-400",
    ghost:
      "border border-line-2 bg-ink-800/60 text-fg hover:border-brand/50 hover:bg-ink-700/70 hover:text-white",
    subtle: "text-muted hover:bg-ink-800/70 hover:text-fg",
    danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-sm font-medium tracking-wide transition-all duration-150 active:scale-[0.98] ${variants[variant]} ${className ?? ""}`}
    >
      {children}
    </button>
  )
}

/** Botón de cierre unificado (icono ✕) para diálogos y paneles. */
export function CloseButton({
  onClick,
  label = "Cerrar",
  className,
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-2/70 bg-ink-800/80 text-muted transition-all duration-150 hover:border-bad/60 hover:bg-bad/10 hover:text-bad active:scale-[0.98] ${className ?? ""}`}
    >
      <span aria-hidden className="text-base leading-none">
        ✕
      </span>
    </button>
  )
}

/** Tipos que le pegan fuerte al equipo, con los badges reutilizados.
 *  Borde rojo = debilidad apilada sin resistir. */
export function VulnerableTypes({ coverage }: { coverage: TypeCoverage[] }) {
  const vuln = coverage
    .filter((c) => c.weak > c.resist)
    .sort(
      (a, b) =>
        ((b.weak >= 2 && b.resist === 0 ? 1 : 0) - (a.weak >= 2 && a.resist === 0 ? 1 : 0)) || b.weak - a.weak,
    )
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-1.5">
        <span className="label text-muted">Debilidades</span>
        <Hint text="Tipos que le pegan súper efectivo a más miembros de los que lo resisten" />
      </div>
      {vuln.length === 0 ? (
        <p className="text-xs text-muted">Ninguno — tu equipo absorbe bien el espectro de tipos.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {vuln.map((c) => {
            const stacked = c.weak >= 2 && c.resist === 0
            return (
              <TypeBadge
                key={c.type}
                type={c.type}
                className={stacked ? "ring-1 ring-bad/70" : undefined}
                title={`${c.type}: ${stacked ? "debilidad apilada sin resistir" : "vulnerable"} — ${c.weak} miembro${c.weak > 1 ? "s" : ""} débil${c.resist ? ` · ${c.resist} resiste` : ""}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
