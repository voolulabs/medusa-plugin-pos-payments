/** Mapeamento adapter → MedusaError (tabela da spec; error-handler do core). */
import { MedusaError } from "@medusajs/framework/utils"
import { MpApiError } from "../../../adapters/mercadopago/types"

/**
 * 404 da adquirente → NOT_FOUND (404). Demais falhas do adapter (outros
 * status, contrato violado) → UNEXPECTED_STATE: no error-handler do framework
 * o tipo cai no 500 PRESERVANDO a mensagem (o operador vê o motivo cru).
 */
export function toMedusaError(error: unknown): MedusaError {
  if (error instanceof MpApiError && error.status === 404) {
    return new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `pos-payments: cobrança não encontrada na adquirente (${String(error.message).slice(0, 120)})`
    )
  }
  return new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `pos-payments: operação recusada pela adquirente (${String(error).slice(0, 200)})`
  )
}
