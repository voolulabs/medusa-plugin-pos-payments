/** GET /v1/orders — busca por external_reference (reconsulta de colisão 409). */
import type { MercadoPagoOrdersClient } from "./client"
import { parseOrder } from "./schema"
import type { MpOrder } from "./types"

/** Janela padrão: ordem criada nas últimas 24h (expiration máxima é 3h). */
function janelaPadrao(): { begin_date: string; end_date: string } {
  const agora = Date.now()
  return {
    begin_date: new Date(agora - 24 * 60 * 60 * 1000).toISOString(),
    end_date: new Date(agora + 60 * 60 * 1000).toISOString(),
  }
}

/** Nunca recria: a colisão de idempotência reconsulta por referência. */
export async function searchOrdersByExternalReference(
  client: MercadoPagoOrdersClient,
  externalReference: string
): Promise<MpOrder[]> {
  const params = new URLSearchParams({
    external_reference: externalReference,
    ...janelaPadrao(),
  })
  const response = await client.request(
    "GET",
    `/v1/orders?${params.toString()}`
  )
  const data =
    typeof response === "object" &&
    response !== null &&
    "data" in (response as object)
      ? (response as { data: unknown[] }).data
      : []
  return (data as unknown[]).map((item) => parseOrder(item))
}
