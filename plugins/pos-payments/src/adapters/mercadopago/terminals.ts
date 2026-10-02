import type { MercadoPagoOrdersClient } from "./client"
import { parseSetupResponse, parseTerminalsPage } from "./schema"
import { buildSetupBody, type SetupTerminalItem } from "./payload"

interface TerminalsQuery {
  /** 1–50 (default 50 na API). */
  limit?: number
  offset?: number
  storeId?: string
  posId?: string
}

/** Pura — serialização na ordem esperada (testada sem rede). */
export function terminalsQueryString(query: TerminalsQuery): string {
  const params = new URLSearchParams()
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.offset !== undefined) params.set("offset", String(query.offset))
  if (query.storeId !== undefined) params.set("store_id", query.storeId)
  if (query.posId !== undefined) params.set("pos_id", query.posId)
  return params.toString()
}

/** GET /terminals/v1/list — terminais ativos na conta, com POS/store e modo. */
export async function listTerminals(
  client: MercadoPagoOrdersClient,
  query: TerminalsQuery = {}
) {
  const qs = terminalsQueryString(query)
  return parseTerminalsPage(
    await client.request("GET", `/terminals/v1/list${qs ? `?${qs}` : ""}`)
  )
}

/** PATCH /terminals/v1/setup — modo de operação; a API aceita UM terminal por request. */
export async function setupTerminal(
  client: MercadoPagoOrdersClient,
  item: SetupTerminalItem
) {
  return parseSetupResponse(
    await client.request("PATCH", "/terminals/v1/setup", {
      body: buildSetupBody(item),
    })
  )
}
