import { describe, expect, it } from "vitest"
import { makeClient, jsonResponse } from "./helpers"
import { MpApiError } from "../types"

describe("createPointOrder — validações do contrato", () => {
  it("rejeita amount sem duas casas decimais sem chamar a API", async () => {
    const { client, calls } = makeClient()
    await expect(
      client.createPointOrder({
        amount: "10",
        externalReference: "x",
        terminalId: "t",
      })
    ).rejects.toThrow(/2 casas/)
    expect(calls).toHaveLength(0)
  })

  it.each(["com acento", "tem;pi", "a".repeat(65), ""])(
    "rejeita external_reference fora de [A-Za-z0-9-_]{1,64}: %s",
    async (reference) => {
      const { client, calls } = makeClient()
      await expect(
        client.createPointOrder({
          amount: "1.00",
          externalReference: reference,
          terminalId: "t",
        })
      ).rejects.toThrow(/external_reference/)
      expect(calls).toHaveLength(0)
    }
  )

  it("rejeita description acima de 150 caracteres", async () => {
    const { client, calls } = makeClient()
    await expect(
      client.createPointOrder({
        amount: "1.00",
        externalReference: "ok",
        terminalId: "t",
        description: "x".repeat(151),
      })
    ).rejects.toThrow(/150 caracteres/)
    expect(calls).toHaveLength(0)
  })
})

describe("cancel/refund — idempotency e header condicional", () => {
  it("cancelOrder faz POST /cancel com idempotency key", async () => {
    const { client, calls, fixedKey } = makeClient()
    await client.cancelOrder("ORD-1")
    expect(calls[0]!.url).toBe("https://api.test/v1/orders/ORD-1/cancel")
    expect(
      (calls[0]!.init.headers as Record<string, string>)["X-Idempotency-Key"]
    ).toBe(fixedKey)
  })

  it("cancelOrder envia X-Allow-Cancelable-Status quando informado", async () => {
    const { client, calls } = makeClient()
    await client.cancelOrder("ORD-1", ["created", "at_terminal"])
    expect(
      (calls[0]!.init.headers as Record<string, string>)[
        "X-Allow-Cancelable-Status"
      ]
    ).toBe("created,at_terminal")
  })

  it("refundOrder faz POST /refund com idempotency key", async () => {
    const { client, calls, fixedKey } = makeClient()
    await client.refundOrder("ORD-1")
    expect(calls[0]!.url).toBe("https://api.test/v1/orders/ORD-1/refund")
    expect(
      (calls[0]!.init.headers as Record<string, string>)["X-Idempotency-Key"]
    ).toBe(fixedKey)
  })
})

describe("erros HTTP", () => {
  it("não-2xx lança MpApiError com status e body", async () => {
    const { client, calls, fetchImpl } = makeClient()
    fetchImpl.mockImplementationOnce(
      async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} })
        return jsonResponse({ message: "order not found" }, 404)
      }
    )
    const promise = client.getOrder("missing")
    await expect(promise).rejects.toBeInstanceOf(MpApiError)
    await promise.catch((error: MpApiError) => {
      expect(error.status).toBe(404)
      expect(error.body).toEqual({ message: "order not found" })
      expect(error.message).toContain("404")
    })
  })

  it("body de erro não-JSON não quebra o parse (vira body vazio)", async () => {
    const { client, fetchImpl } = makeClient()
    fetchImpl.mockImplementationOnce(
      async () => new Response("html de erro", { status: 500 })
    )
    await expect(client.getOrder("x")).rejects.toMatchObject({ status: 500 })
  })
})
