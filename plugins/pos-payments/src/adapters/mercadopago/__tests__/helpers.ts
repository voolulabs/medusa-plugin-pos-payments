import { vi, type Mock } from "vitest"
import { MercadoPagoOrdersClient } from "../client"

type FetchCall = { url: string; init: RequestInit }

export function makeClient(): {
  client: MercadoPagoOrdersClient
  calls: FetchCall[]
  fetchImpl: Mock
  fixedKey: string
} {
  const calls: FetchCall[] = []
  const fixedKey = "idem-0001"
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(
      JSON.stringify({ id: "ORD-1", status: "created", type: "point" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  })
  const client = new MercadoPagoOrdersClient({
    accessToken: "APP_USR-test",
    baseUrl: "https://api.test",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    idempotencyKeyFactory: () => fixedKey,
  })
  return { client, calls, fetchImpl, fixedKey }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
