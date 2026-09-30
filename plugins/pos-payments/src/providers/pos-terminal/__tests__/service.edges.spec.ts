import { MedusaError } from "@medusajs/framework/utils"
import { describe, expect, it } from "vitest"
import PosTerminalProviderService from "../service"

// Bordas do contrato que a suíte de contrato não cobre: branches defensivas
// (catch do getPaymentStatus, !parsed.success do updatePayment), `?? {}` de
// data ausente e fallback de logger. Arquivo separado dos demais specs para
// respeitar o teto opcore de linhas por função.
const makeService = (logger?: unknown) =>
  new PosTerminalProviderService({ logger } as never, { acquirer: "manual" })

describe("PosTerminalProviderService (bordas)", () => {
  it("validateOptions aceita 'manual' (caminho feliz)", () => {
    expect(() =>
      PosTerminalProviderService.validateOptions({ acquirer: "manual" })
    ).not.toThrow()
  })

  it("constructor sem logger cai no console", () => {
    expect(() => makeService(undefined)).not.toThrow()
  })

  it("retrievePayment devolve o data verbatim e {} sem data", async () => {
    const service = makeService(console)
    const out = await service.retrievePayment({ data: { a: 1 } } as never)
    expect(out.data).toEqual({ a: 1 })
    const empty = await service.retrievePayment({} as never)
    expect(empty.data).toEqual({})
  })

  it("refundPayment sem amount não define last_refunded_amount", async () => {
    const service = makeService(console)
    const out = await service.refundPayment({
      data: { captured_at: "t" },
    } as never)
    expect(out.data).toEqual({
      captured_at: "t",
      refunded_at: expect.any(String),
    })
  })

  it("authorizePayment com data ausente devolve só authorized_at", async () => {
    const service = makeService(console)
    const out = await service.authorizePayment({} as never)
    expect(Object.keys(out.data!)).toEqual(["authorized_at"])
  })

  it("capturePayment e cancelPayment com data ausente não lançam", async () => {
    const service = makeService(console)
    const captured = await service.capturePayment({} as never)
    expect(Object.keys(captured.data!)).toEqual(["captured_at"])
    const canceled = await service.cancelPayment({} as never)
    expect(Object.keys(canceled.data!)).toEqual(["canceled_at"])
  })

  it("updatePayment rejeita data não-objeto (INVALID_DATA)", async () => {
    const service = makeService(console)
    // "abc" passa no assertSafeSessionKeys (Object.keys de string são
    // índices) e falha no z.record — única via até o !parsed.success.
    await expect(
      service.updatePayment({ data: "abc" } as never)
    ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA })
  })

  it("métodos sem data usam o fallback ?? {} sem lançar", async () => {
    const service = makeService(console)
    const refunded = await service.refundPayment({} as never)
    expect(Object.keys(refunded.data!)).toEqual(["refunded_at"])
    const updated = await service.updatePayment({} as never)
    expect(updated.data).toEqual({})
    const status = await service.getPaymentStatus({} as never)
    expect(status.status).toBe("pending")
  })

  it("getPaymentStatus degrada para pending com data hostil (nunca lança)", async () => {
    const service = makeService(console)
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("boom")
        },
      }
    )
    const out = await service.getPaymentStatus({ data: hostile })
    expect(out.status).toBe("pending")
  })
})
