import { describe, expect, it } from "vitest"
import { mapOrderStatus, type ChargeState } from "../status"
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
    const esperado: ChargeState = charge
    expect(mapOrderStatus(order(mp)).state).toBe(esperado)
  })

  it("estados neutros não carregam motivo", () => {
    for (const s of [
      "created",
      "at_terminal",
      "processed",
      "expired",
      "action_required",
      "refunded",
    ] as const) {
      const view = mapOrderStatus(order(s))
      expect("reasonCode" in view).toBe(false)
      expect("reason" in view).toBe(false)
    }
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

  it("status fora do enum falha fechado", () => {
    const fantasma = "in_dispute" as MpOrderStatus
    expect(() => mapOrderStatus(order(fantasma))).toThrow(MpContractError)
  })
})
