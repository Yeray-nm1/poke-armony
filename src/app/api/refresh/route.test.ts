import { beforeEach, describe, expect, it, vi } from "vitest"

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock("next/cache", () => ({ revalidateTag }))

import { POST } from "./route"

const req = (headers: Record<string, string> = {}) =>
  new Request("https://poke-armony.vercel.app/api/refresh", { method: "POST", headers })

beforeEach(() => revalidateTag.mockClear())

describe("POST /api/refresh", () => {
  it("200 y revalida base+meta si la petición es de la propia app", async () => {
    const res = await POST(req({ host: "poke-armony.vercel.app", origin: "https://poke-armony.vercel.app" }))
    expect(res.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith("data:base", { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith("data:meta", { expire: 0 })
  })

  it("403 y no revalida si el Origin es de otro sitio", async () => {
    const res = await POST(req({ host: "poke-armony.vercel.app", origin: "https://evil.example" }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "origen no permitido" })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("403 y no revalida si no hay Origin (cliente no navegador)", async () => {
    const res = await POST(req({ host: "poke-armony.vercel.app" }))
    expect(res.status).toBe(403)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
