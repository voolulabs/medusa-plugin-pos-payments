/** Mapeamento adapter → MedusaError (tabela da spec; error-handler do core). */
import { MedusaError } from "@medusajs/framework/utils"
import { MpApiError } from "../../../adapters/mercadopago/types"

/**
 * 404 da adquirente → NOT_FOUND (404), mensagem genérica (o id já está no
 * path). Demais falhas do adapter → UNEXPECTED_STATE: no error-handler do
 * framework o tipo cai no 500 PRESERVANDO a mensagem — decisão registrada na
 * spec: superfície admin-only e mensagens do client só carregam
 * método/path/status (o core loga logger.error para >=500).
 */
export function toMedusaError(error: unknown): MedusaError {
  if (error instanceof MpApiError && error.status === 404) {
    return new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "pos-payments: cobrança não encontrada na adquirente"
    )
  }
  return new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `pos-payments: operação recusada pela adquirente (${String(error).slice(0, 200)})`
  )
}
