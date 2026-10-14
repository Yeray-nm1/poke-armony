"use client"

/**
 * Piezas compartidas entre el editor (ranuras de movimiento) y el selector:
 * la forma de una opción ya resuelta, la etiqueta de categoría y el resumen de
 * potencia/precisión. Viven en un módulo común para que ambos paneles los reutilicen.
 */
export interface MoveOption {
  name: string
  type?: string
  category?: string
  basePower?: number
  /** Precisión: número, o `true` si el movimiento nunca falla. */
  accuracy?: number | true
  shortDesc?: string
  /** Método de aprendizaje ya legible y único ("Nivel", "MT", "Herencia"…). */
  method?: string
}

export const CATEGORY_LABEL: Record<string, string> = {
  Physical: "Físico",
  Special: "Especial",
  Status: "Estado",
}

/**
 * Resumen compacto y etiquetado de potencia y precisión: "Pot 120 · Prec 100".
 * En movimientos de estado no hay potencia (nada de guiones); la precisión solo
 * se muestra si es un número (se omite si el movimiento nunca falla).
 */
export function moveStats(o: Pick<MoveOption, "category" | "basePower" | "accuracy">): string {
  const parts: string[] = []
  if (o.category !== "Status" && o.basePower) parts.push(`Pot ${o.basePower}`)
  if (typeof o.accuracy === "number") parts.push(`Prec ${o.accuracy}`)
  return parts.join(" · ")
}

export function MethodChip({ method }: { method?: string }) {
  if (!method) return null
  return (
    <span className="rounded border border-line-2/70 bg-ink-900/50 px-1 py-px text-[10px] text-muted">{method}</span>
  )
}

/**
 * Badge de categoría del movimiento (Físico/Especial/Estado). Neutro y en forma
 * de píldora para no confundirse con el badge de tipo (que va con color y borde).
 */
export function CategoryBadge({ category, className }: { category?: string; className?: string }) {
  if (!category) return null
  const label = CATEGORY_LABEL[category] ?? category
  return (
    <span
      className={`inline-flex items-center rounded-full bg-white/10 px-2 py-px font-display text-[10px] font-medium tracking-wide text-zinc-100 ring-1 ring-inset ring-white/15 ${className ?? ""}`}
    >
      {label}
    </span>
  )
}
