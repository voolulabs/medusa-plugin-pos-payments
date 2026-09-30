import { describe, expect, it, vi } from "vitest"
import { GET } from "../route"

// Health sob /admin/pos-payments/* (ADR 0005): auth é do core — o handler só
// responde o payload; a request não é usada na Fase 1.
describe("GET /admin/pos-payments/health", () => {
  it("responde 200 com o payload do plugin", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    GET({} as never, res as never)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      status: "ok",
      plugin: "@voolulabs/medusajs-plugin-pos-payments",
      mode: "manual (terminal-presente)",
    })
  })
})
