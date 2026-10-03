/** Mapeamento puro order → estado do charge. Type-aware (point vs qr) e fail-closed. */
import {
  CANCEL_ORIGINS,
  QR_FORBIDDEN_STATUSES,
  RETRY_TAXONOMY,
  UNKNOWN_DETAIL,
  type RetryClass,
} from "./status-taxonomy"
import { MpContractError, type MpOrder, type MpOrderStatus } from "./types"

export type ChargeState =
  | "pending"
  | "awaiting_terminal"
  | "action_required"
  | "paid"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"

export interface ChargeStatusView {
  readonly state: ChargeState
  /** status_detail cru da transação (ou origem do cancelamento / o próprio status). */
  readonly reasonCode?: string
  readonly retryClass?: RetryClass
  /** Copy pt-BR para o operador do caixa — presente quando há motivo a exibir. */
  readonly reason?: string
}

/** Decisão: NENHUM estado MP produz "processing" no v1 — o poll não sintetiza otimismo. */
const STATE_BY_STATUS: Record<MpOrderStatus, ChargeState> = {
  created: "pending",
  at_terminal: "awaiting_terminal",
  processed: "paid",
  canceled: "canceled",
  expired: "expired",
  action_required: "action_required",
  failed: "failed",
  refunded: "refunded",
}

function failureView(order: MpOrder): ChargeStatusView {
  const detail = order.transactions?.payments?.[0]?.status_detail
  const entry =
    (detail !== undefined && RETRY_TAXONOMY[detail]) || UNKNOWN_DETAIL
  return {
    state: "failed",
    reasonCode: detail ?? order.status,
    retryClass: entry.retryClass,
    reason: entry.copy,
  }
}

function cancelView(order: MpOrder): ChargeStatusView {
  const origin = order.transactions?.payments?.[0]?.status
  if (origin !== undefined && CANCEL_ORIGINS.has(origin)) {
    return {
      state: "canceled",
      reasonCode: origin,
      reason:
        origin === "canceled_on_terminal"
          ? "Cobrança cancelada no terminal."
          : "Cobrança cancelada.",
    }
  }
  return { state: "canceled", reason: "Cobrança cancelada." }
}

export function mapOrderStatus(order: MpOrder): ChargeStatusView {
  if (!(order.status in STATE_BY_STATUS)) {
    throw new MpContractError(
      `status de ordem desconhecido: ${String(order.status)}`
    )
  }
  if (order.type === "qr" && QR_FORBIDDEN_STATUSES.has(order.status)) {
    throw new MpContractError(
      `status ${order.status} não existe na máquina qr (ordem ${order.id})`
    )
  }
  const state = STATE_BY_STATUS[order.status]
  if (state === "failed") return failureView(order)
  if (state === "canceled") return cancelView(order)
  return { state }
}
