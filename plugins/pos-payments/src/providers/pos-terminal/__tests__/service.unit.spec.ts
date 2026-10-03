import { describe, expect, it } from "vitest"
import PosTerminalProviderService from "../service"

const service = new PosTerminalProviderService({ logger: console } as never, {
  acquirer: "manual",
})

describe("PosTerminalProviderService", () => {
  it("validateOptions falha sem acquirer", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions(undefined as never)
    ).toThrow(/acquirer/)
  })

  it("validateOptions: mercadopago sem credencial falha no boot (CONSTRAINTS 4)", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions({ acquirer: "mercadopago" })
    ).toThrow(/accessToken/)
  })

  it("validateOptions rejeita adquirente sem adapter implementado", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions({ acquirer: "sumup" })
    ).toThrow(/manual|sumup/)
  })

  it("initiatePayment é no-op e devolve id opaco público", async () => {
    const out = await service.initiatePayment({
      amount: 100,
      currency_code: "brl",
    } as never)
    expect(out.data).toEqual({})
    expect(typeof out.id).toBe("string")
    expect(out.id!.length).toBeGreaterThan(0)
  })

  it("capturePayment é idempotente (mantém o captured_at original)", async () => {
    const first = await service.capturePayment({
      data: { mode: "manual" },
    } as never)
    const second = await service.capturePayment({ data: first.data! } as never)
    expect(second.data!["captured_at"]).toBe(first.data!["captured_at"])
    expect(second.data!["mode"]).toBe("manual")
  })

  it("métodos devolvem o blob completo (sem clobber)", async () => {
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
    expect((await service.getPaymentStatus({ data: {} })).status).toBe(
      "pending"
    )
    expect(
      (await service.getPaymentStatus({ data: { authorized_at: "t" } })).status
    ).toBe("authorized")
    expect(
      (await service.getPaymentStatus({ data: { captured_at: "t" } })).status
    ).toBe("captured")
    expect(
      (await service.getPaymentStatus({ data: { canceled_at: "t" } })).status
    ).toBe("canceled")
    expect((await service.getPaymentStatus(undefined as never)).status).toBe(
      "pending"
    )
  })
})
