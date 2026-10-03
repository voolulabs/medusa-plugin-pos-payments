/** Entradas do charge: conversão de dinheiro e terminal — funções puras fail-closed. */
import { MathBN, MedusaError } from "@medusajs/framework/utils"

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
      "pos-terminal: valor monetário deve ser inteiro positivo em minor units"
    )
  }
  const minor = bn.toNumber()
  if (minor <= 0 || !Number.isSafeInteger(minor)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "pos-terminal: valor monetário deve ser inteiro positivo em minor units"
    )
  }
  return minor
}

/** O terminal é obrigatório no data/context — sem ele não há cobrança. */
export function assertTerminalId(input: {
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
