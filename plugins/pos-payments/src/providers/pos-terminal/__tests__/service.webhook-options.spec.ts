import { describe, expect, it, vi } from "vitest"
import PosTerminalProviderService from "../service"

const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }

function service(options: Record<string, unknown>) {
  return new PosTerminalProviderService({ logger } as never, options as never)
}

describe("validateOptions — webhookSecret obrigatório para mercadopago (T5)", () => {
  it("aceita mercadopago com accessToken e webhookSecret", () => {
    expect(() =>
      service({
        acquirer: "mercadopago",
        accessToken: "tok",
        webhookSecret: "sec",
      })
    ).not.toThrow()
  })

  it("falha alto sem webhookSecret (o loader chama o estático no boot)", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions({
        acquirer: "mercadopago",
        accessToken: "tok",
      })
    ).toThrow(/webhookSecret/)
  })

  it("manual continua sem exigir credenciais", () => {
    expect(() => service({ acquirer: "manual" })).not.toThrow()
  })
})

describe("getWebhookActionAndData delega ao fluxo T5", () => {
  it("manual → not_supported (sem adapter, sem tocar o payload)", async () => {
    const svc = service({ acquirer: "manual" })
    await expect(
      svc.getWebhookActionAndData({
        data: {},
        rawData: Buffer.from("x"),
        headers: {},
      })
    ).resolves.toEqual({ action: "not_supported" })
  })
})
