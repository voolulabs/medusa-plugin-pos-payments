import { describe, expect, it } from "vitest"
import PosTerminalProviderService from "../service"

// Guardas de estado e fronteira do data (review 2026-09-29, deve 1 e 2).
// Arquivo separado do service.unit.spec: opcore complexity.max-function-lines
// (100) — a suíte de contrato ficou acima do teto com os guardas juntos.
const service = new PosTerminalProviderService(
  { logger: console } as never,
  { acquirer: "manual" }
)

describe("PosTerminalProviderService (guardas)", () => {
  it("capturePayment rejeita cobrança cancelada (UNEXPECTED_STATE)", async () => {
    await expect(
      service.capturePayment({ data: { canceled_at: "t" } } as never)
    ).rejects.toThrow(/cancelada/)
  })

  it("refundPayment rejeita cobrança cancelada", async () => {
    await expect(
      service.refundPayment({ data: { canceled_at: "t" } } as never)
    ).rejects.toThrow(/cancelada/)
  })

  it("cancelPayment rejeita cobrança já capturada (é refund)", async () => {
    await expect(
      service.cancelPayment({ data: { captured_at: "t" } } as never)
    ).rejects.toThrow(/capturada/)
  })

  it("refundPayment espelha o amount deste reembolso (minor units)", async () => {
    const out = await service.refundPayment({
      data: { captured_at: "t" },
      amount: 1500,
    } as never)
    expect(out.data!["last_refunded_amount"]).toBe(1500)
  })

  it("initiatePayment e authorizePayment validam a fronteira do data (§3.6)", async () => {
    await expect(
      service.initiatePayment({ data: { ["__proto__"]: { x: 1 } } } as never)
    ).rejects.toThrow(/proibida/)
    await expect(
      service.authorizePayment({ data: { ["constructor"]: 1 } } as never)
    ).rejects.toThrow(/proibida/)
  })
})
