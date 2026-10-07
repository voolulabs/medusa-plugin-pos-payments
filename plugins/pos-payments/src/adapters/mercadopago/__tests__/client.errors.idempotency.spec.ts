/** Idempotency Errors retentáveis da doc oficial da Orders API (A10/W2.3). */
import { describe, expect, it } from "vitest"
import { makeClient, jsonResponse } from "./helpers"
import { MpApiError, MpIdempotencyRetryableError } from "../types"

describe("idempotency errors retentáveis (423/500 — doc oficial)", () => {
  it.each([
    [423, "resource_locked"],
    [500, "idempotency_validation_failed"],
  ] as const)(
    "HTTP %i %s vira MpIdempotencyRetryableError (Idempotency Error oficial, retentável)",
    async (status, mpError) => {
      const { client, fetchImpl } = makeClient()
      fetchImpl.mockImplementationOnce(async () =>
        jsonResponse({ error: mpError, message: "retryable" }, status)
      )
      const promise = client.getOrder("ORD-1")
      await expect(promise).rejects.toBeInstanceOf(MpIdempotencyRetryableError)
      await promise.catch((error: MpApiError) => {
        expect(error.status).toBe(status)
        expect((error as MpIdempotencyRetryableError).retryable).toBe(true)
      })
    }
  )

  it("423 resource_locked consome o Retry-After quando o server manda", async () => {
    const { client, fetchImpl } = makeClient()
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse({ error: "resource_locked", message: "locked" }, 423, {
        "Retry-After": "7",
      })
    )
    await client
      .getOrder("ORD-1")
      .catch((error: MpIdempotencyRetryableError) => {
        expect(error.retryAfter).toBe("7")
      })
  })

  it.each([
    [423, "outra_coisa_423"],
    [500, "internal_error"],
  ] as const)(
    "HTTP %i com erro fora da taxonomia de idempotência (%s) continua MpApiError comum",
    async (status, mpError) => {
      const { client, fetchImpl } = makeClient()
      fetchImpl.mockImplementationOnce(async () =>
        jsonResponse({ error: mpError }, status)
      )
      const promise = client.getOrder("ORD-1")
      await expect(promise).rejects.toBeInstanceOf(MpApiError)
      await promise.catch((error: unknown) => {
        expect(error).not.toBeInstanceOf(MpIdempotencyRetryableError)
      })
    }
  )
})
