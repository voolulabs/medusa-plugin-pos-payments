/** ChargeState -> status da session Medusa + consulta de poll com janelas 10s/40s. */
import type { GetPaymentStatusOutput, Logger } from "@medusajs/framework/types"
import type {
  ChargeState,
  ChargeStatusView,
  PosPaymentsAdapter,
} from "../../adapters/types"
import { CHARGE_DATA_VERSION, applyTransition } from "./charge-state"

/** Logger do core aceita meta winston em runtime; o tipo do framework é estreito. */
export type StructuredLogger = Logger & {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
}

/** Transições típicas ≤10s; action_required até 40s (janela de poll do plugin). */
export const POLL_WINDOW = { typicalSeconds: 10, maxSeconds: 40 } as const

type MedusaSessionStatus = GetPaymentStatusOutput["status"]

// União real (@medusajs/types 2.21.2): authorized | captured | pending |
// requires_more | error | canceled | pending_authorization — SEM requires_action
// nem refunded (refund vive no PAYMENT; a reconciliação é do T5).
const MEDUSA_STATUS: Record<ChargeState, MedusaSessionStatus> = {
  pending: "pending",
  awaiting_terminal: "pending_authorization",
  action_required: "pending_authorization",
  paid: "authorized",
  failed: "error",
  expired: "canceled",
  canceled: "canceled",
  refunded: "captured",
}

function medusaStatusByState(state: ChargeState): MedusaSessionStatus {
  return MEDUSA_STATUS[state]
}

function medusaStatus(view: ChargeStatusView): MedusaSessionStatus {
  return MEDUSA_STATUS[view.state]
}

/**
 * Poll da MP como fonte de verdade: reconsulta o adapter e reconverge o blob.
 * NUNCA lança e NUNCA converte tempo em falha — erro de rede degrada pending.
 */
export async function mpPoll(
  adapter: PosPaymentsAdapter,
  data: Record<string, unknown>,
  logger: StructuredLogger
): Promise<GetPaymentStatusOutput> {
  if (typeof data.charge_id !== "string" || !data.charge_id) {
    return { status: "pending", data }
  }
  try {
    const chargeId = data.charge_id as string
    const before = (data.state as string) ?? "pending"
    const view = await adapter.getCharge(chargeId)
    // Estado terminal local não é sobrescrito pela adquirente (a máquina não
    // volta): preserva, loga e devolve o status do estado salvo.
    if (
      before !== view.state &&
      ["failed", "expired", "canceled", "refunded"].includes(before)
    ) {
      logger.warn("mercadopago: estado terminal local diverge da adquirente", {
        provider_id: "pp_pos-terminal_mercadopago",
        charge_id: chargeId,
        local: before,
        remote: view.state,
      })
      return { status: medusaStatusByState(before as ChargeState), data }
    }
    let next: Record<string, unknown>
    try {
      next = applyTransition(data, view.state)
    } catch {
      // Origem-terminal fora da máquina local: a MP é a fonte de verdade.
      next = { ...data, state: view.state, data_version: CHARGE_DATA_VERSION }
      logger.warn("mercadopago: reconvergência fora da máquina local", {
        provider_id: "pp_pos-terminal_mercadopago",
        charge_id: chargeId,
        from: before,
        to: view.state,
      })
    }
    if (next.state !== before) {
      logger.info("mercadopago: transição do charge (poll)", {
        provider_id: "pp_pos-terminal_mercadopago",
        charge_id: chargeId,
        from: before,
        to: next.state,
        reason_code: view.reasonCode,
      })
    }
    return { status: medusaStatus(view), data: next }
  } catch (error) {
    // D2: erro de consulta degrada para pending — o poll não desiste (40s).
    logger.warn("mercadopago: consulta da adquirente falhou no poll", {
      provider_id: "pp_pos-terminal_mercadopago",
      charge_id: data.charge_id,
      detail: String(error).slice(0, 120),
    })
    return { status: "pending", data }
  }
}
