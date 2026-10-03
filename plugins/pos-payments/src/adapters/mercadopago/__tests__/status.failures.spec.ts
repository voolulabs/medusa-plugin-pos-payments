import { describe, expect, it } from "vitest"
import { mapOrderStatus, type ChargeStatusView } from "../status"
import { RETRY_TAXONOMY, UNKNOWN_DETAIL } from "../status-taxonomy"
import type { MpOrder, MpOrderPayment } from "../types"

function order(extra: Partial<MpOrder>): MpOrder {
  return { id: "ORD-1", status: "failed", ...extra }
}

function comTransacao(detail?: string, status?: string): Partial<MpOrder> {
  const payment: MpOrderPayment = { id: "PAY-1", amount: "10.00" }
  if (detail !== undefined) payment.status_detail = detail
  if (status !== undefined) payment.status = status
  return { transactions: { payments: [payment] } }
}

describe("falha com taxonomia da transação", () => {
  it.each([
    ["insufficient_amount", "retry_with_change"],
    ["rejected_by_issuer", "not_retryable"],
    ["high_risk", "retryable"],
    ["in_review", "escalate"],
  ] as const)("mapea %s para %s com copy", (detail, classe) => {
    const view: ChargeStatusView = mapOrderStatus(order(comTransacao(detail)))
    expect(view.state).toBe("failed")
    expect(view.reasonCode).toBe(detail)
    expect(view.retryClass).toBe(classe)
    expect(view.reason).toBe(RETRY_TAXONOMY[detail]!.copy)
  })

  it("detail desconhecido degrada conservador preservando o código", () => {
    const view = mapOrderStatus(order(comTransacao("issuer_novo_2077")))
    expect(view.retryClass).toBe(UNKNOWN_DETAIL.retryClass)
    expect(view.reasonCode).toBe("issuer_novo_2077")
    expect(view.reason).toBe(UNKNOWN_DETAIL.copy)
  })

  it("failed sem transações usa o status como código e não quebra", () => {
    const view = mapOrderStatus(order({}))
    expect(view.state).toBe("failed")
    expect(view.reasonCode).toBe("failed")
    expect(view.retryClass).toBe(UNKNOWN_DETAIL.retryClass)
    expect(view.reason!.length).toBeGreaterThan(0)
  })
})

describe("cancelamento e refund", () => {
  it("distingue origem api/terminal", () => {
    const api = mapOrderStatus({
      ...order(comTransacao(undefined, "canceled_by_api")),
      status: "canceled",
    })
    const terminal = mapOrderStatus({
      ...order(comTransacao(undefined, "canceled_on_terminal")),
      status: "canceled",
    })
    expect(api.reasonCode).toBe("canceled_by_api")
    expect(api.reason).toContain("cancelada")
    expect(terminal.reasonCode).toBe("canceled_on_terminal")
    expect(terminal.reason).toContain("terminal")
  })

  it("cancelado antes da tentativa: sem reasonCode, copy genérica", () => {
    const view = mapOrderStatus({ ...order({}), status: "canceled" })
    expect(view.state).toBe("canceled")
    expect("reasonCode" in view).toBe(false)
    expect(view.reason!.length).toBeGreaterThan(0)
  })

  it("refund (inclusive originado no terminal) expõe estado próprio", () => {
    const refund = mapOrderStatus({
      id: "ORD-1",
      status: "refunded",
      transactions: { payments: [{ id: "PAY-1", amount: "10.00" }] },
    })
    expect(refund.state).toBe("refunded")
  })
})
