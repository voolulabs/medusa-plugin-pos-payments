/** Resolução do adapter por options.acquirer — falha alta (CONSTRAINTS 4). */
import { MedusaError } from "@medusajs/framework/utils"
import { MercadoPagoAdapter } from "./mercadopago/adapter"
import type { PosPaymentsAdapter } from "./types"

type AdapterOptions = { accessToken?: string; fetchImpl?: typeof fetch }

/**
 * manual → undefined (comportamento legado intacto); mercadopago → adapter com
 * credencial obrigatória; desconhecida → boot falha. Construído UMA vez no boot
 * do provider (nunca por request) — adapter stateless sobre o cliente T1.
 */
export function resolveAdapter(
  acquirer: string,
  options: AdapterOptions
): PosPaymentsAdapter | undefined {
  if (acquirer === "manual") return undefined
  if (acquirer === "mercadopago") {
    if (!options.accessToken) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "pos-terminal: acquirer mercadopago exige accessToken nas options (falha alta — CONSTRAINTS 4)"
      )
    }
    return new MercadoPagoAdapter({
      accessToken: options.accessToken,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })
  }
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `pos-terminal: acquirer não suportada: ${acquirer}`
  )
}
