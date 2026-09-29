import { describe, expect, it } from "vitest"
import PosTerminalProviderService from "../service"
import { mergeSessionData } from "../schema"

const service = new PosTerminalProviderService(
  { logger: console } as never,
  { acquirer: "manual" }
)

describe("PosTerminalProviderService", () => {
  it("validateOptions falha sem acquirer", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions(undefined as never)
    ).toThrow(/acquirer/)
  })

  it("validateOptions rejeita adquirente sem adapter implementado", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions({ acquirer: "mercadopago" })
    ).toThrow(/manual/)
  })

  it("initiatePayment é no-op e devolve id opaco público (§6.2)", async () => {
    const out = await service.initiatePayment({
      amount: 100,
      currency_code: "brl",
    } as never)
    expect(out.data).toEqual({})
    expect(typeof out.id).toBe("string")
    expect(out.id!.length).toBeGreaterThan(0)
  })

  it("capturePayment é idempotente (mantém o captured_at original)", async () => {
    const first = await service.capturePayment({ data: { mode: "manual" } } as never)
    const second = await service.capturePayment({ data: first.data! } as never)
    expect(second.data!["captured_at"]).toBe(first.data!["captured_at"])
  })

  it("métodos devolvem o blob completo (§1.11: sem clobber)", async () => {
    const auth = await service.authorizePayment({
      data: { external_id: "x1" },
    } as never)
    expect(auth.data!["external_id"]).toBe("x1")
    expect(auth.status).toBe("authorized")
    const refund = await service.refundPayment({ data: auth.data } as never)
    expect(refund.data!["external_id"]).toBe("x1")
    const cancel = await service.cancelPayment({ data: refund.data } as never)
    expect(cancel.data!["external_id"]).toBe("x1")
  })

  it("getPaymentStatus mapeia o data e nunca lança", async () => {
    expect((await service.getPaymentStatus({ data: {} })).status).toBe("pending")
    expect((await service.getPaymentStatus({ data: { authorized_at: "t" } })).status).toBe("authorized")
    expect((await service.getPaymentStatus({ data: { captured_at: "t" } })).status).toBe("captured")
    expect((await service.getPaymentStatus({ data: { canceled_at: "t" } })).status).toBe("canceled")
    expect((await service.getPaymentStatus(undefined as never)).status).toBe("pending")
  })

  it("deletePayment limpa o estado (§6.2)", async () => {
    const out = await service.deletePayment({ data: { captured_at: "t" } } as never)
    expect(out.data).toEqual({})
  })

  it("updatePayment rejeita chave de prototype (engenharia §3.6)", async () => {
    await expect(
      service.updatePayment({
        amount: 100,
        currency_code: "brl",
        data: { a: 1, ["__proto__"]: { x: 1 } },
      } as never)
    ).rejects.toThrow(/proibida/)
  })

  it("updatePayment ecoa o data válido", async () => {
    const out = await service.updatePayment({
      amount: 100,
      currency_code: "brl",
      data: { a: 1 },
    })
    expect(out.data).toEqual({ a: 1 })
  })

  it("mergeSessionData é depth-1 por own-properties", () => {
    const merged = { ...mergeSessionData({ a: 1 }, { b: 2 }) }
    expect(merged).toEqual({ a: 1, b: 2 })
  })

  it("getWebhookActionAndData devolve not_supported (Fase 1)", async () => {
    const out = await service.getWebhookActionAndData({
      data: {},
      rawData: Buffer.from("{}"),
      headers: {},
    })
    expect(out.action).toBe("not_supported")
  })
})
