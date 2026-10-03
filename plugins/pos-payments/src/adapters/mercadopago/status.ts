/** Mapeamento puro order → estado do charge. Type-aware (point vs qr) e fail-closed. */
import { QR_FORBIDDEN_STATUSES, type RetryClass } from "./status-taxonomy"
import { cancelView, failureView } from "./status-view"
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
  /** Status cru da order — sempre presente, para auditoria no wiring. */
  readonly rawStatus: MpOrderStatus
  /** Id do pagamento inspecionado, quando a ordem o traz. */
  readonly paymentId?: string | undefined
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

export function mapOrderStatus(order: MpOrder): ChargeStatusView {
  // hasOwnProperty e não `in`: chaves herdadas de Object.prototype não passam.
  if (!Object.prototype.hasOwnProperty.call(STATE_BY_STATUS, order.status)) {
    throw new MpContractError(
      `status de ordem desconhecido: ${String(order.status)}`
    )
  }
  // type ausente = point (decisão da spec); "online" e afins estão fora do escopo presencial.
  if (
    order.type !== undefined &&
    order.type !== "point" &&
    order.type !== "qr"
  ) {
    throw new MpContractError(
      `tipo de ordem fora do escopo: ${order.type} (ordem ${order.id})`
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
  if (state === "action_required") {
    // Doc oficial: action_required não muda mais — a transação fica em
    // waiting_payment/check_on_terminal (o dinheiro pode ter passado).
    return {
      state,
      rawStatus: order.status,
      reason: "Verifique o terminal para confirmar o resultado do pagamento.",
    }
  }
  return { state, rawStatus: order.status }
}
