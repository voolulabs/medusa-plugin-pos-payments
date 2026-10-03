/** Conversão única de dinheiro entre o domínio (minor units) e o MP (string decimal). */
import { MathBN } from "@medusajs/framework/utils"
import { MpContractError } from "./types"

/** 1999 → "19.99" — divisão exata via MathBN (nunca float: 19.99 * 100 !== 1999). */
export function minorUnitsToDecimalString(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new MpContractError(
      `amountMinor deve ser inteiro seguro >= 0: recebido ${amountMinor}`
    )
  }
  return MathBN.div(amountMinor, 100).toFixed(2)
}
