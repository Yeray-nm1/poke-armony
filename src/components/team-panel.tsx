"use client"

import { useState } from "react"
import { isValidSpread, speciesOf } from "@/core"
import type { Dataset } from "@/core"
import { useTeam } from "@/lib/store"
import { Panel, SectionTitle, Sprite, TYPE_COLOR, TypeBadge, typeColor } from "./ui"

export function TeamPanel({ dataset }: { dataset: Dataset }) {
  const team = useTeam((s) => s.team)
  const select = useTeam((s) => s.select)
  const move = useTeam((s) => s.move)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  // Tipo dominante del equipo (por el tipo primario de cada miembro) para teñir
  // el acento de la cabecera del panel.
  const dominant = (() => {
    const counts = new Map<string, number>()
    for (const set of team) {
      const t = speciesOf(dataset.pokedex, set.id)?.types[0]
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    let best: string | undefined
    let n = 0
    for (const [t, c] of counts) if (c > n) { n = c; best = t }
    return best
  })()

  return (
    <Panel className="rise space-y-4 [animation-delay:80ms]">
      <SectionTitle tone={dominant ? TYPE_COLOR[dominant] : undefined}
        right={
          <span className="num text-xs text-faint">
            equipo <span className="text-fg">{team.length}</span>/6
          </span>
        }
      >
        Tu equipo
      </SectionTitle>

      <ul className="overflow-hidden rounded-xl border border-line">
        {team.map((set, i) => {
          const species = speciesOf(dataset.pokedex, set.id)
          const name = species?.name ?? set.name ?? set.id
          const moves = set.attacks.filter(Boolean)
          const spreadOk = isValidSpread(set).ok
          const tcol = typeColor(species?.types)
          return (
            <li
              key={`${set.id}-${i}`}
              draggable
              onDragStart={(e) => {
                setDrag(i)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                if (over !== i) setOver(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (drag !== null) move(drag, i)
                setDrag(null)
                setOver(null)
              }}
              onDragEnd={() => {
                setDrag(null)
                setOver(null)
              }}
              onClick={() => select(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  select(i)
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Editar ${name}`}
              className={`group relative flex cursor-pointer items-center gap-3 border-b border-line/70 bg-ink-900/40 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-ink-800/70 ${
                drag === i ? "opacity-40" : ""
              } ${over === i && drag !== null && drag !== i ? "bg-brand/10 ring-1 ring-inset ring-brand/60" : ""}`}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-0.5 opacity-50 transition-opacity group-hover:opacity-100"
                style={{ background: tcol, boxShadow: `0 0 10px ${tcol}` }}
              />
              <span
                className="cursor-grab select-none text-faint/70 transition-colors group-hover:text-muted active:cursor-grabbing"
                title="Arrastra para reordenar"
                aria-hidden
              >
                ⠿
              </span>
              <Sprite name={name} size={40} className="rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-medium text-fg">{name}</span>
                  {!spreadOk && (
                    <span
                      title="Reparto de SP inválido"
                      aria-label="Reparto de SP inválido"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-bad shadow-[0_0_8px_rgba(251,113,133,0.9)]"
                    />
                  )}
                  <span className="flex shrink-0 gap-1">
                    {species?.types.map((t) => (
                      <TypeBadge key={t} type={t} />
                    ))}
                  </span>
                  {set.nature && (
                    <span
                      title="Naturaleza"
                      className="ml-auto shrink-0 rounded border border-line-2/60 bg-ink-800/70 px-1.5 py-px font-display text-[10px] tracking-wide text-muted"
                    >
                      {set.nature}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs leading-tight text-muted/90">
                  {moves.length > 0 ? moves.join(" · ") : "sin movimientos"}
                </span>
                {set.item && (
                  <span className="mt-1 block truncate text-[11px] text-faint">Objeto: {set.item}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-faint">Toca para editar · arrastra ⠿ para reordenar las ranuras.</p>
    </Panel>
  )
}
