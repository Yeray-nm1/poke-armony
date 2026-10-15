import { describe, expect, it } from "vitest"
import { isSameOrigin } from "./guard"

/** Petición con las cabeceras que pone el cliente (host/origin/sec-fetch-site). */
const req = (headers: Record<string, string>) =>
  new Request("https://poke-armony.vercel.app/api/refresh", { method: "POST", headers })

describe("isSameOrigin", () => {
  it("acepta un POST del navegador desde la propia app (Origin == Host)", () => {
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app", origin: "https://poke-armony.vercel.app" }))).toBe(true)
  })

  it("acepta localhost en desarrollo", () => {
    expect(isSameOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true)
  })

  it("rechaza un Origin de otro sitio (CSRF)", () => {
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app", origin: "https://evil.example" }))).toBe(false)
  })

  it("rechaza un Origin malformado", () => {
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app", origin: "no-es-una-url" }))).toBe(false)
  })

  it("rechaza si falta Host", () => {
    expect(isSameOrigin(req({ origin: "https://poke-armony.vercel.app" }))).toBe(false)
  })

  it("sin Origin, acepta solo si Sec-Fetch-Site es same-origin", () => {
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app", "sec-fetch-site": "same-origin" }))).toBe(true)
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app", "sec-fetch-site": "cross-site" }))).toBe(false)
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app", "sec-fetch-site": "none" }))).toBe(false)
  })

  it("rechaza un cliente que no es navegador (curl: sin Origin ni Sec-Fetch-Site)", () => {
    expect(isSameOrigin(req({ host: "poke-armony.vercel.app" }))).toBe(false)
  })
})
