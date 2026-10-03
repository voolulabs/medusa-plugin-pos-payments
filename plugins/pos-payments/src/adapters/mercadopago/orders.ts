import type { MercadoPagoOrdersClient } from "./client"
import { parseOrder } from "./schema"
import type { MpOrder } from "./types"

/** POST /v1/orders/{id}/cancel — idempotency key obrigatória. */
export async function cancelOrder(
  client: MercadoPagoOrdersClient,
  orderId: string,
  idempotencyKey: string,
  opts: { allowAtTerminal?: boolean } = {}
): Promise<MpOrder> {
  // Header condicional do contrato: o único valor documentado é "at_terminal"
  // (sem o header, só ordens em `created` são canceláveis).
  const extraHeaders = opts.allowAtTerminal
    ? { "x-allow-cancelable-status": "at_terminal" }
    : undefined
  return parseOrder(
    await client.request(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      extraHeaders ? { idempotencyKey, extraHeaders } : { idempotencyKey }
    )
  )
}

/** POST /v1/orders/{id}/refund — Point só suporta estorno total (body vazio, 201). */
export async function refundOrder(
  client: MercadoPagoOrdersClient,
  orderId: string,
  idempotencyKey: string
): Promise<MpOrder> {
  return parseOrder(
    await client.request(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/refund`,
      { idempotencyKey }
    )
  )
}
