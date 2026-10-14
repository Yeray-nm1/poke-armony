import { expect, test } from "@playwright/test"
import { gotoWorkspace, harmonyValue, teamNames, teamSlots } from "./helpers"

test.describe("Workspace", () => {
  test("carga con el equipo de ejemplo, el diagnóstico y las pestañas", async ({ page }) => {
    await gotoWorkspace(page)

    // Cabecera: acciones principales.
    await expect(page.getByRole("button", { name: "Importar" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Exportar" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Reiniciar" })).toBeVisible()

    // Equipo de ejemplo: 6 ranuras editables.
    await expect(teamSlots(page)).toHaveCount(6)

    // Armonía dentro de rango.
    const harmony = await harmonyValue(page)
    expect(harmony).toBeGreaterThan(0)
    expect(harmony).toBeLessThanOrEqual(100)

    // Métricas de armonía: las siete etiquetas.
    for (const label of [
      "Defensa",
      "Cobertura ofensiva",
      "Cierre de amenazas",
      "Roles",
      "Velocidad",
      "Sinergia",
      "Redundancia",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }

    // Pestañas del análisis.
    await expect(page.getByRole("tab", { name: /Sugerencias/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Amenazas/ })).toBeVisible()
  })

  test("reordena las ranuras del equipo con drag & drop", async ({ page }) => {
    await gotoWorkspace(page)
    const before = await teamNames(page)
    expect(before).toHaveLength(6)

    // Arrastra la primera ranura a la posición de la tercera.
    await teamSlots(page).nth(0).dragTo(teamSlots(page).nth(2))

    // El orden queda rotado: [1, 2, 0, 3, 4, 5].
    await expect
      .poll(() => teamNames(page), { timeout: 10_000 })
      .toEqual([before[1], before[2], before[0], before[3], before[4], before[5]])
  })
})
