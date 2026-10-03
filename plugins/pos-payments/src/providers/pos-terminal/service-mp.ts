/** Operações de ciclo de vida do charge por adapter (usadas pelo service). */
import { MathBN, MedusaError } from "@medusajs/framework/utils"
import type { StructuredLogger } from "./mp-status"
import type {
  CreateChargeInput,
  PosPaymentsAdapter,
} from "../../adapters/types"
import { applyTransition } from "./charge-state"

export const PROVIDER_LOG_ID = "pp_pos-terminal_mercadopago"

/** Semente determinística de idempotência — sem id, falha alta (nunca aleatória). */
function sessionSeed(input: {
  id?: string
  context?: { session_id?: string }
}): string {
  const seed = input.context?.session_id ?? input.id
  if (!seed) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "pos-terminal: sem id de sessão não há idempotência determinística"
    )
  }
  return seed
}

function idempotencyKey(seed: string, purpose: string): string {
  return `pos-terminal:${seed}:${purpose}`
}

/** External reference: <=64 chars [A-Za-z0-9-_], sem PII — fail-closed. */
function assertExternalReference(seed: string): string {
  if (!/^[A-Za-z0-9-_]{1,64}$/.test(seed)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "pos-terminal: id de sessão fora do alfabeto da external_reference"
    )
  }
  return seed
}

/** Minor units via MathBN (CONSTRAINTS 1) — BRL tem 2 casas; fail-closed. */
export function toMinor(amount: unknown): number {
  const value =
    typeof amount === "object" &&
    amount !== null &&
    "value" in (amount as object)
      ? (amount as { value: string | number }).value
      : (amount as string | number)
  const bn = MathBN.mult(String(value), 100)
  // Fração de centavo rejeitada ANTES do toNumber (toNumber arredondaria calado).
  if (String(bn).includes(".")) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "pos-terminal: valor monetário fora do domínio de minor units"
    )
  }
  const minor = bn.toNumber()
  if (!Number.isSafeInteger(minor)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "pos-terminal: valor monetário fora do domínio de minor units"
    )
  }
  return minor
}

function assertTerminalId(input: {
  data?: Record<string, unknown>
  context?: Record<string, unknown>
}): string {
  const terminalId =
    (input.data?.terminal_id as string | undefined) ??
    (input.context?.terminal_id as string | undefined)
  if (!terminalId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "pos-terminal: terminal_id obrigatório no data/context para cobrar na maquininha"
    )
  }
  return terminalId
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
  const data = applyTransition(
    {
      charge_id: chargeId,
      acquirer: adapter.acquirer,
      idempotency_key: key,
      amount_minor: createInput.amountMinor,
    },
    view.state
  )
  logger.info("pos-terminal: charge criado na adquirente", {
    provider_id: PROVIDER_LOG_ID,
    charge_id: chargeId,
    external_reference: createInput.externalReference,
    state: view.state,
  })
  return { id: chargeId, data }
}
