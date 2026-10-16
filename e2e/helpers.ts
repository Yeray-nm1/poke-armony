import { expect, type Page } from "@playwright/test"

/** Clave de Zustand persist donde vive el equipo. */
const STORE_KEY = "pokearmony-team"

/**
 * Espera a que la home esté lista: cabecera visible y servidor ya re-puntuado
 * con daño real (el indicador "calculando daño real…" desaparece cuando llega
 * la respuesta autoritativa de `/api/recommend`).
 */
export async function expectWorkspaceReady(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "PokeArmony" })).toBeVisible({ timeout: 120_000 })
  await expect(page.locator("text=calculando daño real")).toHaveCount(0, { timeout: 120_000 })
}

/** Navega a la home y espera a que esté lista. */
export async function gotoWorkspace(page: Page) {
  await page.goto("/")
  await expectWorkspaceReady(page)
}

/** Ranuras del equipo: cada una es un botón con `aria-label="Editar <nombre>"`. */
export function teamSlots(page: Page) {
  return page.getByRole("button", { name: /^Editar / })
}

/** Nombres de las especies en el equipo, en orden de ranura. */
export async function teamNames(page: Page): Promise<string[]> {
  return teamSlots(page).evaluateAll((els) =>
    els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/^Editar /, "")),
  )
}

/** Equipo tal y como quedó guardado en localStorage (JSON crudo), o null si no hay. */
export async function storedTeamJson(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORE_KEY)
}

/** Equipo tal y como quedó guardado en localStorage (ids), o null si no hay. */
export async function storedTeamIds(page: Page): Promise<string[] | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { team?: { id: string }[] } }
    return parsed.state?.team?.map((s) => s.id) ?? null
  }, STORE_KEY)
}

/** Valor de armonía (0–100) que muestra el medidor del diagnóstico. */
export async function harmonyValue(page: Page): Promise<number> {
  // El span del número es hermano del rótulo "/ 100" dentro de la caja del gauge.
  const scope = page.locator("div.relative.shrink-0", { hasText: "/ 100" }).first()
  return Number.parseFloat(await scope.locator("span").first().innerText())
}

/** Caja modal (`fixed`) cuyo contenido incluye `title`. */
export function modal(page: Page, title: string) {
  return page.locator("div.fixed", { hasText: title }).last()
}
