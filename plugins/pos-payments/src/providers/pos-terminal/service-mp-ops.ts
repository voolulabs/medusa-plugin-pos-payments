/** Capture/cancel/refund do charge MP — confirmação local ou chamada idempotente. */
import { MedusaError } from "@medusajs/framework/utils"
import type { PosPaymentsAdapter } from "../../adapters/types"
import type { StructuredLogger } from "./mp-status"
import { applyTransition } from "./charge-state"
import { PROVIDER_LOG_ID, toMinor } from "./service-mp"

function keyFor(chargeId: string, purpose: string): string {
  return `pos-terminal:${chargeId}:${purpose}`
}

function unexpected(what: string, detail: string): MedusaError {
  const msg = `pos-terminal: ${what} (${detail})`
  return new MedusaError(MedusaError.Types.UNEXPECTED_STATE, msg)
}

/** Capture = confirmação LOCAL de que a MP credite (Point captura no processo). */
export async function mpCapture(
  adapter: PosPaymentsAdapter,
  data: Record<string, unknown>,
  logger: StructuredLogger
): Promise<{ data: Record<string, unknown> }> {
  if (data.captured_at) return { data }
  const chargeId = data.charge_id as string
  const view = await adapter.getCharge(chargeId)
  if (view.state !== "paid") {
    logger.warn("pos-terminal: captura sem pagamento creditado", {
      provider_id: PROVIDER_LOG_ID,
      charge_id: chargeId,
      state: view.state,
    })
    throw unexpected("captura sem pagamento creditado", view.state)
  }
  logger.info("pos-terminal: captura confirmada (local)", {
    provider_id: PROVIDER_LOG_ID,
    charge_id: chargeId,
    payment_id: view.paymentId,
  })
  return {
    data: applyTransition(
      { ...data, captured_at: new Date().toISOString() },
      "paid"
    ),
  }
}

export async function mpCancel(
  adapter: PosPaymentsAdapter,
  data: Record<string, unknown>,
  logger: StructuredLogger
): Promise<{ data: Record<string, unknown> }> {
  if (data.captured_at) {
    throw unexpected(
      "cancelamento de cobrança já capturada (usar refund)",
      "captured"
    )
  }
  try {
    const chargeId = data.charge_id as string
    const view = await adapter.cancelCharge(
      chargeId,
      keyFor(chargeId, "cancel"),
      data.state === "awaiting_terminal" ? { allowAtTerminal: true } : undefined
    )
    logger.info("pos-terminal: cobrança cancelada na adquirente", {
      provider_id: PROVIDER_LOG_ID,
      charge_id: chargeId,
      to: view.state,
    })
    return { data: applyTransition({ ...data }, view.state) }
  } catch (error) {
    logger.warn("pos-terminal: 4xx/5xx no cancelamento", {
      provider_id: PROVIDER_LOG_ID,
      charge_id: data.charge_id,
      detail: String(error).slice(0, 120),
    })
    throw unexpected(
      "cancelamento recusado pela adquirente",
      "adquirente recusou"
    )
  }
}

export async function mpRefund(
  adapter: PosPaymentsAdapter,
  data: Record<string, unknown>,
  amount: unknown,
  logger: StructuredLogger
): Promise<{ data: Record<string, unknown> }> {
  // Decisão de produto v1: só total (a MP suporta parcial via transactions[]).
  // Fail-closed: exige amount_minor no blob e valor IGUAL ao cobrado.
  if (typeof data.amount_minor !== "number") {
    throw unexpected("blob sem amount_minor", "invariante")
  }
  // amount do Medusa já é minor units — compara verbatim (sem converter 2x).
  if (amount !== undefined && amount !== data.amount_minor) {
    throw unexpected(
      "reembolso parcial não suportado no Point v1",
      "amount difere"
    )
  }
  const chargeId = data.charge_id as string
  const view = await adapter.refundCharge(chargeId, keyFor(chargeId, "refund"))
  logger.info("pos-terminal: reembolso total na adquirente", {
    provider_id: PROVIDER_LOG_ID,
    charge_id: chargeId,
    to: view.state,
  })
  return {
    data: applyTransition(
      { ...data, refunded_at: new Date().toISOString() },
      view.state
    ),
  }
}
