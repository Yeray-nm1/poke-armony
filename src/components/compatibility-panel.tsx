"use client"

import { useMemo, useState } from "react"
import type { CompatibilityReport, PairNote } from "@/core"
import { Chip, Sprite } from "./ui"

interface Link {
  note: PairNote
  /** Otra pieza implicada (o la misma, si es auto-beneficio). */
  other: number
  /** `out`: el seleccionado es el actor · `in`: el otro lo es · `self`: él mismo. */
  dir: "out" | "in" | "self"
  kind: "synergy" | "conflict"
}

const ARROW = { out: "→", in: "←", self: "↻" } as const

/**
 * Panel de Compatibilidad: se elige un miembro en una banda de sprites y se ven
 * sus lazos con el resto — qué aporta (→), qué recibe (←) y qué hace consigo
 * mismo (↻) — separando lo que suma de lo que resta. Sustituye a la antigua
 * métrica de Sinergia: explica el «por qué» en vez de puntuarlo.
 */
export function CompatibilityPanel({ report, names }: { report: CompatibilityReport; names: string[] }) {
  const n = names.length

  // Índice de lazos por miembro (cada nota tiñe a sus dos extremos).
  const linksOf = useMemo(() => {
    const map = new Map<number, Link[]>()
    const push = (i: number, link: Link) => {
      const arr = map.get(i) ?? []
      arr.push(link)
      map.set(i, arr)
    }
    const add = (note: PairNote, kind: Link["kind"]) => {
      if (note.a === note.b) {
        push(note.a, { note, other: note.a, dir: "self", kind })
        return
      }
      push(note.a, { note, other: note.b, dir: "out", kind })
      push(note.b, { note, other: note.a, dir: "in", kind })
    }
    for (const s of report.synergies) add(s, "synergy")
    for (const c of report.conflicts) add(c, "conflict")
    for (const arr of map.values()) arr.sort((x, y) => x.other - y.other || x.note.tag.localeCompare(y.note.tag))
    return map
  }, [report])

  const firstLinked = useMemo(() => {
    for (let i = 0; i < n; i++) if (linksOf.has(i)) return i
    return 0
  }, [linksOf, n])
  const [sel, setSel] = useState(firstLinked)
  const current = Math.min(sel, Math.max(0, n - 1))

  if (n === 0) return <p className="text-sm text-muted">Añade miembros para ver cómo se emparejan.</p>

  const links = linksOf.get(current) ?? []
  const conflicts = links.filter((l) => l.kind === "conflict")
  const synergies = links.filter((l) => l.kind === "synergy")

  return (
    <div className="space-y-4">
      <p className="text-xs text-faint">
        Elige un miembro y mira cómo se lleva con el resto: qué aporta (→), qué recibe (←) y qué hace consigo mismo (↻).
      </p>

      {/* Banda de sprites: el foco. Un punto marca el tono global (rojo si choca). */}
      <div className="flex flex-wrap justify-between gap-2">
        {names.map((nm, i) => {
          const own = linksOf.get(i) ?? []
          const conflict = own.some((l) => l.kind === "conflict")
          const synergy = own.some((l) => l.kind === "synergy")
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSel(i)}
              aria-pressed={i === current}
              title={nm}
              className={`relative grid h-11 w-11 place-items-center rounded-xl border transition-colors ${
                i === current ? "border-brand/60 bg-brand/12" : "border-line/60 bg-ink-950/40 hover:bg-ink-800/60"
              }`}
            >
              <Sprite name={nm} size={36} className="rounded-md" />
              {(conflict || synergy) && (
                <span
                  aria-hidden
                  className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${conflict ? "bg-bad" : "bg-brand"}`}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="space-y-3 border-t border-line/70 pt-3.5">
        {links.length === 0 ? (
          <p className="text-sm text-muted">
            {names[current]} no interactúa de forma especial con el resto: va a lo suyo.
          </p>
        ) : (
          <>
            <LinkList title="Se estorba con" links={conflicts} names={names} />
            <LinkList title="Se lleva bien con" links={synergies} names={names} />
          </>
        )}
      </div>
    </div>
  )
}

function LinkList({
  title,
  links,
  names,
}: {
  title: string
  links: Link[]
  names: string[]
}) {
  if (!links.length) return null
  return (
    <div className="space-y-2">
      <p className="label text-muted">{title}</p>
      <ul className="space-y-1.5">
        {links.map((l, i) => (
          <li key={i} className="flex items-start gap-2">
            <Sprite name={names[l.other]} size={22} className="mt-0.5 shrink-0 rounded" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-faint">
                  {ARROW[l.dir]} {l.dir === "self" ? "él mismo" : names[l.other]}
                </span>
                <Chip tone={l.kind === "conflict" ? "bad" : l.note.tag === "cobertura" ? "default" : "brand"}>
                  {l.note.tag}
                </Chip>
              </div>
              <p className="text-xs leading-snug text-muted">{l.note.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
