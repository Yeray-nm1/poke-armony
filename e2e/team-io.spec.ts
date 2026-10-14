import { expect, test } from "@playwright/test"
import { expectWorkspaceReady, gotoWorkspace, modal, storedTeamIds, teamNames, teamSlots } from "./helpers"

/** Dos sets válidos en formato Showdown (SP dentro del presupuesto de 66). */
const IMPORTADO = `Garchomp @ Focus Sash
Ability: Rough Skin
Jolly Nature
Stat Points: 32 Atk / 32 Spe / 2 HP
- Earthquake
- Dragon Claw
- Protect
- Rock Slide

Incineroar @ Sitrus Berry
Ability: Intimidate
Adamant Nature
Stat Points: 32 Atk / 32 HP / 2 SpD
- Flare Blitz
- Knock Off
- Fake Out
- Parting Shot`

test("importa, exporta y persiste el equipo (round-trip Showdown)", async ({ page }) => {
  await gotoWorkspace(page)
  await expect(teamSlots(page)).toHaveCount(6)

  // ── Importar ──────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Importar" }).click()
  const importar = modal(page, "Importar equipo")
  await importar.getByRole("textbox").fill(IMPORTADO)
  await importar.getByRole("button", { name: "Importar" }).click()

  await expect(teamSlots(page)).toHaveCount(2)
  expect(await teamNames(page)).toEqual(["Garchomp", "Incineroar"])
  await expect(page.getByRole("button", { name: "Editar Garchomp" })).toBeVisible()

  // Y se guarda en localStorage.
  await expect.poll(() => storedTeamIds(page)).toEqual(["garchomp", "incineroar"])

  // ── Exportar: round-trip con el mismo equipo ──────────────────────────
  await page.getByRole("button", { name: "Exportar" }).click()
  const exportar = modal(page, "Exportar equipo")
  const texto = await exportar.getByRole("textbox").inputValue()
  expect(texto).toContain("Garchomp")
  expect(texto).toContain("Incineroar")
  expect(texto).toContain("Ability: Rough Skin")
  expect(texto).toContain("Jolly Nature")
  // El export ordena los SP en el orden canónico (HP → Atk → … → Spe).
  expect(texto).toContain("Stat Points: 2 HP / 32 Atk / 32 Spe")
  expect(texto).toContain("- Earthquake")
  await exportar.getByRole("button", { name: "Cerrar" }).click()
  await expect(page.getByRole("heading", { name: "Exportar equipo" })).toHaveCount(0)

  // ── Persistencia: recarga y el equipo sigue ahí ───────────────────────
  await page.reload()
  await expectWorkspaceReady(page)
  await expect(teamSlots(page)).toHaveCount(2)
  expect(await teamNames(page)).toEqual(["Garchomp", "Incineroar"])

  // ── Reiniciar: vuelve al equipo de ejemplo ───────────────────────────
  await page.getByRole("button", { name: "Reiniciar" }).click()
  await expect(teamSlots(page)).toHaveCount(6)
})

test("avisa si el texto pegado no contiene ningún Pokémon", async ({ page }) => {
  await gotoWorkspace(page)
  await page.getByRole("button", { name: "Importar" }).click()
  const importar = modal(page, "Importar equipo")
  await importar.getByRole("textbox").fill("   ")
  await importar.getByRole("button", { name: "Importar" }).click()

  await expect(page.getByText("No se reconoció ningún Pokémon")).toBeVisible()
  // El diálogo sigue abierto y el equipo intacto.
  await expect(teamSlots(page)).toHaveCount(6)
})
