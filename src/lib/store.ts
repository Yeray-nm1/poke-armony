"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { StatKey, Team, TeamSet } from "@/core/types"
import { clampSp } from "@/core"
import { sampleTeam } from "./sample-team"

/** Campo que se está eligiendo en el panel derecho. */
export type PickerKind = "move" | "item" | "ability" | "nature" | "species"

export interface Picker {
  kind: PickerKind
  /** Ranura del equipo a la que afecta. */
  slot: number
  /** Índice de ranura de movimiento (solo para kind="move"). */
  index?: number
}

interface TeamStore {
  team: Team
  /** Ranura abierta en el editor (null = cerrado). */
  selected: number | null
  /** Campo cuyo panel derecho está abierto (null = cerrado). */
  picker: Picker | null
  select: (i: number | null) => void
  openPicker: (p: Picker) => void
  closePicker: () => void
  setTeam: (t: Team) => void
  update: (i: number, patch: Partial<TeamSet>) => void
  setMove: (i: number, idx: number, move: string) => void
  setSp: (i: number, key: StatKey, value: number) => void
  applySet: (i: number, set: TeamSet) => void
  move: (from: number, to: number) => void
  reset: () => void
}

const store = create<TeamStore>()(
  persist(
    (set) => ({
      team: sampleTeam,
      selected: null,
      picker: null,
      // Abrir/cerrar el editor reinicia el panel lateral.
      select: (i) => set({ selected: i, picker: null }),
      openPicker: (p) => set({ picker: p }),
      closePicker: () => set({ picker: null }),
      setTeam: (t) => set({ team: t.slice(0, 6) }),
      update: (i, patch) => set((s) => ({ team: s.team.map((x, j) => (j === i ? { ...x, ...patch } : x)) })),
      setMove: (i, idx, move) =>
        set((s) => ({
          team: s.team.map((x, j) => {
            if (j !== i) return x
            const attacks = [...x.attacks]
            while (attacks.length < 4) attacks.push("")
            attacks[idx] = move
            return { ...x, attacks }
          }),
        })),
      setSp: (i, key, value) =>
        set((s) => ({
          team: s.team.map((x, j) => (j === i ? { ...x, sp: { ...x.sp, [key]: clampSp(x, key, value) } } : x)),
        })),
      applySet: (i, next) => set((s) => ({ team: s.team.map((x, j) => (j === i ? next : x)) })),
      move: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.team.length || to >= s.team.length) return {}
          const team = [...s.team]
          const [item] = team.splice(from, 1)
          team.splice(to, 0, item)
          return { team }
        }),
      reset: () => set({ team: sampleTeam, selected: null, picker: null }),
    }),
    { name: "pokearmony-team", partialize: (s) => ({ team: s.team }), skipHydration: true },
  ),
)

type TeamStoreApi = typeof store

// Fast Refresh reevalúa este módulo en desarrollo. Cacheamos la instancia en
// globalThis para conservar el equipo en memoria y no sobrescribir con el set de
// ejemplo el equipo guardado en localStorage entre recargas en caliente (HMR).
const globalStore = globalThis as unknown as { __pokearmonyTeam?: TeamStoreApi }

export const useTeam: TeamStoreApi = globalStore.__pokearmonyTeam ?? store

if (process.env.NODE_ENV !== "production") globalStore.__pokearmonyTeam = useTeam
