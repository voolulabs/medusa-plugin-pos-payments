import type { MercadoPagoOrdersClient } from "./client"

type MpOperatingMode = "PDV" | "STANDALONE" | "UNDEFINED"

/** Terminal da conta (GET /terminals/v1/list — reference in-person-payments/point). */
interface MpTerminal {
  id: string
  pos_id?: number | string
  store_id?: number | string
  external_pos_id?: string
  operating_mode: MpOperatingMode
}

interface MpTerminalsPage {
  data: { terminals: MpTerminal[] }
  paging: { total: number; offset: number; limit: number }
}

interface ListTerminalsQuery {
  /** 1–50 (default 50 na API). */
  limit?: number
  offset?: number
  storeId?: string
  posId?: string
}

/** GET /terminals/v1/list — terminais ativos na conta, com POS/store e modo. */
export async function listTerminals(
  client: MercadoPagoOrdersClient,
  query: ListTerminalsQuery = {}
): Promise<MpTerminalsPage> {
  const params = new URLSearchParams()
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.offset !== undefined) params.set("offset", String(query.offset))
  if (query.storeId) params.set("store_id", query.storeId)
  if (query.posId) params.set("pos_id", query.posId)
  const qs = params.toString()
  return client.request(
    "GET",
    `/terminals/v1/list${qs ? `?${qs}` : ""}`
  ) as unknown as Promise<MpTerminalsPage>
}
