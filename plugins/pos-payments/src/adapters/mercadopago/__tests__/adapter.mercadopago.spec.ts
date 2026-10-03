import { describe, expect, it } from "vitest"
import { MercadoPagoAdapter } from "../adapter"
import { jsonResponse } from "./helpers"

function makeAdapter() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const path = String(url)
    if (path.endsWith("/refund"))
      return jsonResponse(orderBody("refunded"), 201)
    if (path.endsWith("/cancel")) return jsonResponse(orderBody("canceled"))
    if (/\/v1\/orders\/[A-Za-z0-9-]+$/.test(path))
      return jsonResponse(orderBody("processed"))
    return jsonResponse(orderBody("created"))
  }) as unknown as typeof fetch
  return {
    adapter: new MercadoPagoAdapter({
      accessToken: "test-token-fixture",
      fetchImpl,
    }),
    calls,
  }
}

function orderBody(status: string) {
  return {
    id: "ORD-77",
    status,
    type: "point",
    transactions: { payments: [{ id: "PAY-1", amount: "19.99" }] },
  }
}

describe("MpAdapter na interface comum", () => {
  it("createCharge converte minor->decimal e envia a idempotency key", async () => {
    const { adapter, calls } = makeAdapter()
    const out = await adapter.createCharge(
      {
        amountMinor: 1999,
        externalReference: "pay_01H",
        terminalId: "NEWLAND_N950__S1",
        expirationTime: "PT30M",
        description: "venda balcão",
        paymentMethodDefaultType: "credit_card",
      },
      "pos-terminal:pay_01H:charge"
    )
    expect(out.chargeId).toBe("ORD-77")
    expect(out.view.state).toBe("pending")
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.transactions.payments[0].amount).toBe("19.99")
    expect(body.config.point.terminal_id).toBe("NEWLAND_N950__S1")
    expect(body.expiration_time).toBe("PT30M")
    expect(body.description).toBe("venda balcão")
    expect(body.config.payment_method.default_type).toBe("credit_card")
    expect(calls[0]!.init.headers).toMatchObject({
      "X-Idempotency-Key": "pos-terminal:pay_01H:charge",
    })
  })

  it("getCharge mapea processed -> paid com a view do T2", async () => {
    const { adapter } = makeAdapter()
    const view = await adapter.getCharge("ORD-77")
    expect(view.state).toBe("paid")
    expect(view.rawStatus).toBe("processed")
    expect(view.paymentId).toBe("PAY-1")
  })

  it("cancel em awaiting_terminal manda o header condicional do contrato", async () => {
    const { adapter, calls } = makeAdapter()
    await adapter.cancelCharge("ORD-77", "k-cancel", { allowAtTerminal: true })
    expect(calls[0]!.init.headers).toMatchObject({
      "x-allow-cancelable-status": "at_terminal",
    })
  })

  it("cancel/refund expõem os estados da adquirente com key própria", async () => {
    const { adapter, calls } = makeAdapter()
    const cancel = await adapter.cancelCharge("ORD-77", "k-cancel")
    const refund = await adapter.refundCharge("ORD-77", "k-refund")
    expect(cancel.state).toBe("canceled")
    expect(refund.state).toBe("refunded")
    expect(calls[0]!.init.headers).toMatchObject({
      "X-Idempotency-Key": "k-cancel",
    })
    expect(calls[1]!.init.headers).toMatchObject({
      "X-Idempotency-Key": "k-refund",
    })
  })
})
