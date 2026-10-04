import { describe, expect, it } from "vitest"
import { POST } from "../charges/route"
import { VALID_BODY, headerOf, makeReq, makeRes } from "./routes.helpers"

describe("POST /admin/pos-payments/charges", () => {
  it("cria a cobrança com a chave determinística do externalReference", async () => {
    const { req, calls } = makeReq({ body: VALID_BODY })
    const res = makeRes()
    await POST(req, res)
    expect(calls[0]!.url).toContain("/v1/orders")
    expect(headerOf(calls[0]!.init, "X-Idempotency-Key")).toBe(
      "pos-payments-mercadopago:ps_01ABC:charge"
    )
    expect(headerOf(calls[0]!.init, "Authorization")).toBe(
      "Bearer test-token-fixture"
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: "ORD-1", rawStatus: "created" })
    )
  })

  it("payload no contrato oficial: amount decimal e terminal no config", async () => {
    const { req, calls } = makeReq({ body: VALID_BODY })
    await POST(req, makeRes())
    const payload = JSON.parse(String(calls[0]!.init.body)) as {
      transactions: { payments: Array<{ amount: string }> }
      config: { point: { terminal_id: string } }
    }
    expect(payload.transactions.payments[0]!.amount).toBe("19.99")
    expect(payload.config.point.terminal_id).toBe(VALID_BODY.terminalId)
  })
})
