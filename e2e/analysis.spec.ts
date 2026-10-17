import { expect, test } from "@playwright/test"
import { gotoWorkspace, storedTeamIds, storedTeamJson } from "./helpers"

test("aplica una recomendación y el cambio queda guardado", async ({ page }) => {
  await gotoWorkspace(page)

  await page.getByRole("tab", { name: /Sugerencias/ }).click()
  const aplicar = page.getByRole("button", { name: "Aplicar" })
  await expect(aplicar.first()).toBeVisible()

  const antes = await storedTeamJson(page)
  await aplicar.first().click()

  // El set cambia. La primera sugerencia puede ser un ajuste o un «rehacer»
  // (mismo Pokémon, otro rol), así que se compara el equipo guardado, no las
  // especies: el cambio puede no tocar el nombre.
  await expect.poll(() => storedTeamJson(page)).not.toEqual(antes)
  // El equipo sigue persistido.
  const guardado = await storedTeamIds(page)
  expect(guardado).not.toBeNull()
  expect(guardado!.length).toBeGreaterThan(0)
})

test("el comparador muestra el antes y el después sin aplicar", async ({ page }) => {
  await gotoWorkspace(page)

  await page.getByRole("tab", { name: /Sugerencias/ }).click()
  const comparar = page.getByTitle("Comparar antes de aplicar")
  await expect(comparar.first()).toBeVisible()
  await comparar.first().click()

  await expect(page.getByRole("heading", { name: "Comparar cambio" })).toBeVisible()
  await expect(page.getByText("Set de la ranura")).toBeVisible()
  await expect(page.getByText("Métricas del equipo")).toBeVisible()
  await expect(page.getByText("Antes", { exact: true })).toBeVisible()
  await expect(page.getByText("Después", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Cerrar" }).click()
  await expect(page.getByRole("heading", { name: "Comparar cambio" })).toHaveCount(0)
})

test("abre el detalle de una amenaza y lo cierra", async ({ page }) => {
  await gotoWorkspace(page)

  await page.getByRole("tab", { name: /Amenazas/ }).click()
  const amenazas = page.locator("section.surface", { hasText: "Toca una amenaza para ver el detalle" })
  const primera = amenazas.locator("ul li button").first()
  await expect(primera).toBeVisible()
  await primera.click()

  // El panel de detalle muestra el set común y el recuento de respuestas.
  await expect(page.getByText(/Responde \d+\/6/)).toBeVisible()
  await expect(page.getByText("Set más común")).toBeVisible()

  await page.getByRole("button", { name: "Cerrar" }).click()
  await expect(page.getByText(/Responde \d+\/6/)).toHaveCount(0)
})
