/** Operações de ciclo de vida do charge por adapter (usadas pelo service). */
import { MedusaError } from "@medusajs/framework/utils"
import type {
  CreateChargeInput,
  PosPaymentsAdapter,
} from "../../adapters/types"
import { applyTransition } from "./charge-state"
import { assertTerminalId, toMinor } from "./charge-input"
import type { StructuredLogger } from "./mp-status"

export const PROVIDER_LOG_ID = "pp_pos-terminal_mercadopago"

/** Chaves que SÓ o provider grava — replay do cliente não as forja. */
const RESERVADAS = new Set([
  "charge_id",
  "acquirer",
  "idempotency_key",
  "amount_minor",
  "state",
  "data_version",
])

/** Semente determinística de idempotência — sem id, falha alta (nunca aleatória). */
function sessionSeed(input: {
  id?: string
  context?: { session_id?: string }
}): string {
  const seed = input.context?.session_id ?? input.id
  if (!seed) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "mercadopago: sem id de sessão não há idempotência determinística"
    )
  }
  return seed
}

function idempotencyKey(seed: string, purpose: string): string {
  return `pos-payments-mercadopago:${seed}:${purpose}`
}

/** External reference: <=64 chars [A-Za-z0-9-_], sem PII — fail-closed. */
function assertExternalReference(seed: string): string {
  if (!/^[A-Za-z0-9-_]{1,64}$/.test(seed)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "mercadopago: id de sessão fora do alfabeto da external_reference"
    )
  }
  return seed
}

export async function mpInitiate(
  adapter: PosPaymentsAdapter,
  input: {
    amount: unknown
    id?: string
    data?: Record<string, unknown>
    context?: Record<string, unknown>
  },
  logger: StructuredLogger
): Promise<{ id: string; data: Record<string, unknown> }> {
  const seed = sessionSeed(input)
  const key = idempotencyKey(seed, "charge")
  const createInput: CreateChargeInput = {
    amountMinor: toMinor(input.amount),
    externalReference: assertExternalReference(seed),
    terminalId: assertTerminalId(input),
  }
  const { chargeId, view } = await adapter.createCharge(createInput, key)
  // Blob COMPLETO: preserva o data da sessão, exceto as chaves reservadas do
  // charge — state/data_version nunca são forjados pelo replay do cliente.
  const data = applyTransition(
    {
      ...Object.fromEntries(
        Object.entries(input.data ?? {}).filter(([k]) => !RESERVADAS.has(k))
      ),
      charge_id: chargeId,
      acquirer: adapter.acquirer,
      idempotency_key: key,
      amount_minor: createInput.amountMinor,
    },
    view.state
  )
  logger.info("mercadopago: charge criado na adquirente", {
    provider_id: PROVIDER_LOG_ID,
    charge_id: chargeId,
    external_reference: createInput.externalReference,
    state: view.state,
  })
  return { id: chargeId, data }
}
