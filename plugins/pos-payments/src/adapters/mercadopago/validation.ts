/** Validações do contrato oficial Orders API do Mercado Pago (verificado 2026-09). */
import { MpContractError } from "./types"

const TWO_DECIMALS = /^\d+\.\d{2}$/
const EXTERNAL_REFERENCE = /^[A-Za-z0-9_-]{1,64}$/

export function assertAmount(amount: string): void {
  if (!TWO_DECIMALS.test(amount)) {
    throw new MpContractError(
      `amount deve ser string decimal com 2 casas ("15.00"): recebido "${amount}"`
    )
  }
}

export function assertExternalReference(reference: string): void {
  if (!EXTERNAL_REFERENCE.test(reference)) {
    throw new MpContractError(
      "external_reference deve ter 1-64 caracteres de [A-Za-z0-9-_], sem PII" +
        `: recebido "${reference}"`
    )
  }
}

export function assertDescription(description: string): void {
  if (description.length > 150) {
    throw new MpContractError(
      `description deve ter no máximo 150 caracteres: recebido ${description.length}`
    )
  }
}
