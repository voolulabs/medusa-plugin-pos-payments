/** Reembolso do charge MP — decisão de produto v1: só TOTAL, fail-closed. */
import type { StructuredLogger } from "./mp-status"
import type { PosPaymentsAdapter } from "../../adapters/types"
import { applyTransition } from "./charge-state"
import { PROVIDER_LOG_ID } from "./service-mp"
import { keyFor, unexpected } from "./service-mp-ops"
import { toMinor } from "./charge-input"

export async function mpRefund(
  adapter: PosPaymentsAdapter,
  data: Record<string, unknown>,
  amount: unknown,
  logger: StructuredLogger
): Promise<{ data: Record<string, unknown> }> {
  // Decisão de produto v1: só total (a MP suporta parcial via transactions[]).
  // Fail-closed: exige amount E amount_minor, e valor IGUAL ao cobrado.
  if (amount === undefined) {
    throw unexpected("reembolso sem amount do core", "fail-closed")
  }
  if (typeof data.amount_minor !== "number") {
    throw unexpected("blob sem amount_minor", "invariante")
  }
  if (amount !== undefined) {
    // O core passa refund.raw_amount: BigNumberRawValue {value} em unidades
    // MAIORES (@medusajs/payment 2.21.2, refundPaymentFromProvider_).
    const raw =
      typeof amount === "object" &&
      amount !== null &&
      "value" in (amount as object)
        ? (amount as { value: string | number }).value
        : (amount as string | number)
    if (toMinor(raw) !== (data.amount_minor as number)) {
      throw unexpected(
        "reembolso parcial não suportado no Point v1",
        "amount difere"
      )
    }
  }
  const chargeId = data.charge_id as string
  const view = await adapter.refundCharge(
    chargeId,
    keyFor(chargeId, `refund:${String(data.amount_minor)}`)
  )
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
