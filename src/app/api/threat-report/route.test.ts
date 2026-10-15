import { beforeEach, describe, expect, it, vi } from "vitest"

const { getBattle, detailedReport } = vi.hoisted(() => ({ getBattle: vi.fn(), detailedReport: vi.fn() }))
vi.mock("@/lib/data", () => ({ getBattle }))
vi.mock("@/core/damage", () => ({ detailedReport }))

import { POST } from "./route"

const species = (name: string, types: string[]) => ({
  name,
  types,
  baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  abilities: [],
  hiddenAbilities: [],
})

const battle = (pokedex: Record<string, unknown>) => ({
  pokedex,
  moves: {},
  legal: { legal: [], megaStones: {} },
  meta: { usage: [], byId: {} },
})

const post = (body: unknown) =>
  POST(
    new Request("https://poke-armony.vercel.app/api/threat-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )

beforeEach(() => {
  detailedReport.mockReset()
  detailedReport.mockReturnValue({ id: "pikachu" })
  getBattle.mockReset()
  getBattle.mockResolvedValue(battle({ pikachu: species("Pikachu", ["Electric"]) }))
})

describe("POST /api/threat-report", () => {
  it("200 con el informe si la amenaza existe", async () => {
    const res = await post({ team: [{ id: "pikachu", attacks: [] }], threatId: "pikachu" })
    expect(res.status).toBe(200)
    expect(detailedReport).toHaveBeenCalledOnce()
  })

  it("404 si el threatId no resuelve a ninguna especie (antes: 200 con informe fantasma)", async () => {
    const res = await post({ team: [{ id: "pikachu", attacks: [] }], threatId: "no-existe" })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'amenaza desconocida: "no-existe"' })
    expect(detailedReport).not.toHaveBeenCalled()
  })

  it("resuelve el id con toId (arcanine-hisui → arcaninehisui)", async () => {
    getBattle.mockResolvedValue(battle({ arcaninehisui: species("Arcanine-Hisui", ["Fire", "Rock"]) }))
    const res = await post({ team: [{ id: "pikachu", attacks: [] }], threatId: "arcanine-hisui" })
    expect(res.status).toBe(200)
  })

  it("400 si falta el threatId o no es texto", async () => {
    expect((await post({ team: [{ id: "pikachu", attacks: [] }] })).status).toBe(400)
    expect((await post({ team: [{ id: "pikachu", attacks: [] }], threatId: 7 })).status).toBe(400)
  })

  it("400 si el equipo no es válido", async () => {
    expect((await post({ team: "nope", threatId: "pikachu" })).status).toBe(400)
  })

  it("400 si el cuerpo no es JSON", async () => {
    const res = await post("no-json")
    expect(res.status).toBe(400)
  })
})
