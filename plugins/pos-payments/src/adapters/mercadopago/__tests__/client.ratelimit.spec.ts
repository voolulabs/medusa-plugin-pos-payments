import { describe, expect, it } from "vitest"
import { MercadoPagoOrdersClient } from "../client"
import { MpApiError } from "../types"
import { jsonResponse } from "./helpers"

function clientWith(
  fetchImpl: typeof fetch,
  timeoutMs?: number
): MercadoPagoOrdersClient {
  return new MercadoPagoOrdersClient({
    accessToken: "APP_USR-test",
    baseUrl: "https://api.test",
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
}

async function getError(promise: Promise<unknown>): Promise<MpApiError> {
  return (await promise.catch((e: unknown) => e)) as MpApiError
}

describe("429 rate limit — helper respeita Retry-After (ADR 0001)", () => {
  it("429 com Retry-After expõe o header no MpApiError", async () => {
    const client = clientWith(async () =>
      jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "20" })
    )
    const error = await getError(client.getOrder("ORD-1"))
    expect(error).toBeInstanceOf(MpApiError)
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe("20")
  })

  it("429 sem Retry-After deixa retryAfter undefined", async () => {
    const client = clientWith(async () => jsonResponse({}, 429))
    const error = await getError(client.getOrder("ORD-1"))
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBeUndefined()
  })

  it("não-429 não expõe retryAfter mesmo com header presente", async () => {
    const client = clientWith(async () =>
      jsonResponse({ message: "boom" }, 500, { "Retry-After": "20" })
    )
    const error = await getError(client.getOrder("ORD-1"))
    expect(error.status).toBe(500)
    expect(error.retryAfter).toBeUndefined()
  })
})

describe("timeout duro rejeita a promise", () => {
  it("abort do AbortSignal rejeita (não pendura a chamada)", async () => {
    const fetchImpl = ((_url: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted pelo timeout"))
        )
      })) as typeof fetch
    const client = clientWith(fetchImpl, 20)
    await expect(client.getOrder("ORD-1")).rejects.toThrow("aborted")
  })
})
