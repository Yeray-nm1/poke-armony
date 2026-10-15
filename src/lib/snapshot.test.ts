import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { put, head } = vi.hoisted(() => ({ put: vi.fn(), head: vi.fn() }))
vi.mock("@vercel/blob", () => ({ put, head }))

import { loadSnapshot, saveSnapshot, withFallback } from "./snapshot"

const TOKEN = "BLOB_READ_WRITE_TOKEN"

beforeEach(() => {
  put.mockReset()
  head.mockReset()
  delete process.env[TOKEN]
})

afterEach(() => {
  delete process.env[TOKEN]
  vi.unstubAllGlobals()
})

describe("saveSnapshot", () => {
  it("sin token es un no-op (desarrollo local y tests)", async () => {
    await saveSnapshot("base", { a: 1 })
    expect(put).not.toHaveBeenCalled()
  })

  it("con token sube el JSON con marca de tiempo en una ruta fija", async () => {
    process.env[TOKEN] = "tok"
    put.mockResolvedValue({ url: "https://blob/x" })
    await saveSnapshot("base", { a: 1 })

    expect(put).toHaveBeenCalledOnce()
    const [pathname, body, opts] = put.mock.calls[0]
    expect(pathname).toBe("pokearmony/base.json")
    expect(opts).toMatchObject({
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: "tok",
    })
    const parsed = JSON.parse(body)
    expect(parsed.data).toEqual({ a: 1 })
    expect(typeof parsed.savedAt).toBe("string")
  })

  it("traga los errores de Blob (best-effort: no rompe la ingesta)", async () => {
    process.env[TOKEN] = "tok"
    put.mockRejectedValue(new Error("boom"))
    await expect(saveSnapshot("base", { a: 1 })).resolves.toBeUndefined()
  })
})

describe("loadSnapshot", () => {
  it("sin token devuelve null", async () => {
    expect(await loadSnapshot("base")).toBeNull()
  })

  it("con token lee la URL de head y descarga el JSON", async () => {
    process.env[TOKEN] = "tok"
    head.mockResolvedValue({ url: "https://blob/base.json" })
    const snapshot = { savedAt: "2026-10-15T00:00:00.000Z", data: { a: 1 } }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 })))
    expect(await loadSnapshot("base")).toEqual(snapshot)
    expect(head).toHaveBeenCalledWith("pokearmony/base.json", { token: "tok" })
  })

  it("devuelve null si el blob no existe (head lanza)", async () => {
    process.env[TOKEN] = "tok"
    head.mockRejectedValue(new Error("not found"))
    expect(await loadSnapshot("base")).toBeNull()
  })

  it("devuelve null si la descarga no es 200", async () => {
    process.env[TOKEN] = "tok"
    head.mockResolvedValue({ url: "https://blob/base.json" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })))
    expect(await loadSnapshot("base")).toBeNull()
  })
})

describe("withFallback", () => {
  it("devuelve el resultado de load cuando va bien (sin tocar Blob)", async () => {
    const load = vi.fn(async () => ({ ok: true }))
    await expect(withFallback(["base", "base-battle"], load)).resolves.toEqual({ ok: true })
    expect(head).not.toHaveBeenCalled()
  })

  it("si load falla, usa el primer snapshot disponible (orden de preferencia)", async () => {
    process.env[TOKEN] = "tok"
    head.mockResolvedValue({ url: "https://blob/base.json" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ savedAt: "x", data: { from: "base" } }))))
    const load = vi.fn(async () => {
      throw new Error("fuente caída")
    })
    await expect(withFallback(["base", "base-battle"], load)).resolves.toEqual({ from: "base" })
  })

  it("re-lanza el error original si no hay ninguna copia", async () => {
    process.env[TOKEN] = "tok"
    head.mockRejectedValue(new Error("not found"))
    const load = vi.fn(async () => {
      throw new Error("fuente caída")
    })
    await expect(withFallback(["base", "base-battle"], load)).rejects.toThrow("fuente caída")
  })
})
