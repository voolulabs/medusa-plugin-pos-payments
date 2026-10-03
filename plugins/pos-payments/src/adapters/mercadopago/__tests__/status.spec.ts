import { describe, expect, it } from "vitest"
import { mapOrderStatus } from "../status"
import { MpContractError, type MpOrder, type MpOrderStatus } from "../types"

function order(status: MpOrderStatus, extra?: Partial<MpOrder>): MpOrder {
  return { id: "ORD-1", status, ...extra }
}

describe("máquina point (8 estados)", () => {
  it.each([
    ["created", "pending"],
    ["at_terminal", "awaiting_terminal"],
    ["processed", "paid"],
    ["canceled", "canceled"],
    ["expired", "expired"],
    ["action_required", "action_required"],
    ["failed", "failed"],
    ["refunded", "refunded"],
  ] as const)("%s -> %s", (mp, charge) => {
    expect(mapOrderStatus(order(mp)).state).toBe(charge)
  })

  it("type ausente é tratado como point (decisão da spec)", () => {
    expect(mapOrderStatus(order("at_terminal")).state).toBe("awaiting_terminal")
  })

  it("estados neutros não carregam motivo, mas expõem rawStatus", () => {
    const view = mapOrderStatus(
      order("expired", {
        transactions: {
          payments: [
            { id: "PAY-1", amount: "1.00", status_detail: "high_risk" },
          ],
        },
      })
    )
    expect("reasonCode" in view).toBe(false)
    expect("reason" in view).toBe(false)
    expect(view.rawStatus).toBe("expired")
  })

  it("status da order prevalece sobre detail de recusa na transação", () => {
    const processado = mapOrderStatus(
      order("processed", {
        transactions: {
          payments: [
            { id: "PAY-1", amount: "1.00", status_detail: "high_risk" },
          ],
        },
      })
    )
    expect(processado.state).toBe("paid")
    expect("reason" in processado).toBe(false)
  })

  it("nenhum estado MP produz processing", () => {
    const estados = [
      "created",
      "at_terminal",
      "processed",
      "canceled",
      "expired",
      "action_required",
      "failed",
      "refunded",
    ] as const
    for (const s of estados)
      expect(mapOrderStatus(order(s)).state).not.toBe("processing")
  })
})

describe("máquina qr (type-aware)", () => {
  it.each(["created", "processed", "canceled", "expired", "refunded"] as const)(
    "aceita %s",
    (s) => {
      expect(mapOrderStatus(order(s, { type: "qr" })).state).toBeDefined()
    }
  )

  it.each(["at_terminal", "action_required", "failed"] as const)(
    "rejeita %s na máquina qr",
    (s) => {
      expect(() => mapOrderStatus(order(s, { type: "qr" }))).toThrow(
        MpContractError
      )
    }
  )

  it("type presente fora do escopo falha fechado", () => {
    expect(() => mapOrderStatus(order("created", { type: "online" }))).toThrow(
      MpContractError
    )
  })
})

describe("fail-closed contra valores hostis", () => {
  it("status fora do enum lança", () => {
    expect(() => mapOrderStatus(order("in_dispute" as MpOrderStatus))).toThrow(
      MpContractError
    )
  })

  it("chaves herdadas de protótipo não passam na guarda", () => {
    const fantasmas: string[] = ["toString", "__proto__", "constructor"]
    for (const fantasma of fantasmas) {
      expect(() => mapOrderStatus(order(fantasma as MpOrderStatus))).toThrow(
        MpContractError
      )
    }
  })
})
