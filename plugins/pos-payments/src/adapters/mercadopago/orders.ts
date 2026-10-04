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

/**
 * Refund resiliente por ESTADO (ADR 0001): o POST pode falhar porque a ordem
 * já foi reembolsada (origem terminal — reconciliação do T5) ou com o refund
 * criado em trânsito. O veredito vem do re-fetch da ordem, nunca do corpo do
 * erro: `refunded` volta como sucesso; qualquer outro estado relança o erro
 * original (falha de permissão não vira falso sucesso).
 */
export async function refundOrderResilient(
  client: MercadoPagoOrdersClient,
  orderId: string,
  idempotencyKey: string
): Promise<MpOrder> {
  try {
    return await refundOrder(client, orderId, idempotencyKey)
  } catch (error) {
    try {
      const order = await client.getOrder(orderId)
      if (order.status === "refunded") return order
    } catch {
      // Sem visibilidade do estado real: relança o erro original.
    }
    throw error
  }
}
