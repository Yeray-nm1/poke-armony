import { defineConfig, devices } from "@playwright/test"

/**
 * E2E de la interfaz.
 *
 *   pnpm test:e2e          (levanta un servidor de dev propio en el puerto E2E)
 *   pnpm test:e2e:ui       (modo interactivo)
 *
 * Por defecto usa un puerto propio (3210) para no chocar con el `pnpm dev` que
 * puedas tener abierto. Si ya tienes la app servida, apunta a ella con
 * `E2E_BASE_URL` (y entonces no se levanta ningún servidor):
 *
 *   E2E_BASE_URL=https://poke-armony.vercel.app pnpm test:e2e
 *
 * OJO: los tests necesitan RED. La app es API-only (sin semilla local): ingiere
 * Showdown + Limitless en runtime, así que el primer arranque tarda (de ahí los
 * timeouts holgados).
 */
const PORT = Number(process.env.E2E_PORT ?? 3210)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Todos los tests comparten un único servidor: en serie y sin paralelismo,
  // para no medir el ruido que generaría el HMR.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: "ignore",
        stderr: "pipe",
      },
})
