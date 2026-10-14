"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { exportTeam, parseTeam } from "@/core"
import type { Dataset } from "@/core"
import { useTeam } from "@/lib/store"
import { Button, CloseButton } from "./ui"

export type DialogKind = "import" | "export" | null

export function ImportExportDialog({
  dataset,
  kind,
  onClose,
}: {
  dataset: Dataset
  kind: DialogKind
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {kind && (
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
            className="surface accent-glass fixed left-1/2 top-1/2 z-50 w-[min(36rem,92vw)] -translate-x-1/2 -translate-y-1/2 p-5 pt-6"
          >
            {kind === "import" ? <ImportPane onClose={onClose} /> : <ExportPane dataset={dataset} onClose={onClose} />}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function ImportPane({ onClose }: { onClose: () => void }) {
  const setTeam = useTeam((s) => s.setTeam)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const doImport = () => {
    const team = parseTeam(text).filter((s) => s.id)
    if (team.length === 0) {
      setError("No se reconoció ningún Pokémon. Pega el equipo en formato Showdown.")
      return
    }
    setTeam(team)
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Importar equipo</h2>
          <p className="mt-0.5 text-xs text-muted">
            Pega tu equipo en formato Showdown (uno por línea en blanco). Se aceptan líneas{" "}
            <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[11px] text-info">Stat Points:</code> o{" "}
            <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[11px] text-info">EVs:</code>.
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        rows={12}
        placeholder={"Arcanine-Hisui @ Focus Sash\nAbility: Rock Head\nJolly Nature\n- Flare Blitz\n- Protect"}
        className="input resize-y font-mono text-xs"
      />
      {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
      <div className="flex justify-end">
        <Button variant="primary" onClick={doImport}>
          Importar
        </Button>
      </div>
    </div>
  )
}

function ExportPane({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  const team = useTeam((s) => s.team)
  const [copied, setCopied] = useState(false)
  const text = exportTeam(team, dataset.pokedex)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* el usuario puede copiar a mano */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Exportar equipo</h2>
          <p className="mt-0.5 text-xs text-muted">Cópialo para compartirlo o guardarlo.</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <textarea readOnly value={text} rows={12} className="input resize-y font-mono text-xs text-muted" />
      <div className="flex justify-end">
        <Button variant="primary" onClick={copy}>
          {copied ? "¡Copiado!" : "Copiar"}
        </Button>
      </div>
    </div>
  )
}
