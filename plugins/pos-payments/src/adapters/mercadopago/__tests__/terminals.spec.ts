import { describe, expect, it } from "vitest"
import { makeClient } from "./helpers"
import { listTerminals } from "../terminals"

describe("listTerminals — GET /terminals/v1/list", () => {
  it("sem query: URL nua, GET sem idempotency key", async () => {
    const { client, calls } = makeClient()
    await listTerminals(client)
    expect(calls[0]!.url).toBe("https://api.test/terminals/v1/list")
    expect(calls[0]!.init.method).toBe("GET")
    expect(
      (calls[0]!.init.headers as Record<string, string>)["X-Idempotency-Key"]
    ).toBeUndefined()
  })

  it("serializa limit/offset/store_id/pos_id na ordem esperada", async () => {
    const { client, calls } = makeClient()
    await listTerminals(client, {
      limit: 10,
      offset: 5,
      storeId: "S1",
      posId: "P1",
    })
    expect(calls[0]!.url).toBe(
      "https://api.test/terminals/v1/list?limit=10&offset=5&store_id=S1&pos_id=P1"
    )
  })

  it("devolve a página tipada de terminais", async () => {
    const { client, fetchImpl } = makeClient()
    fetchImpl.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              terminals: [
                {
                  id: "NEWLAND_N950__SBX0000001",
                  pos_id: "47792476",
                  store_id: "47792478",
                  external_pos_id: "SUC0101POS",
                  operating_mode: "PDV",
                },
              ],
            },
            paging: { total: 1, offset: 0, limit: 50 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    )
    const page = await listTerminals(client)
    expect(page.data.terminals[0]).toMatchObject({
      id: "NEWLAND_N950__SBX0000001",
      operating_mode: "PDV",
    })
    expect(page.paging.total).toBe(1)
  })
})
