import { MedusaError } from "@medusajs/framework/utils"
import { describe, expect, it } from "vitest"
import {
  assertSafeSessionKeys,
  mergeSessionData,
  posTerminalSessionSchema,
} from "../schema"

// Defesas da fronteira testadas DIRETO na schema: via service, o
// assertSafeSessionKeys roda antes do zod e mascara as branches do
// superRefine — aqui elas são exercidas de fato (money path, régua 95%).
describe("schema do data da session", () => {
  it("assertSafeSessionKeys rejeita cada chave de prototype", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(() => assertSafeSessionKeys({ [key]: 1 })).toThrow(MedusaError)
    }
  })

  it("posTerminalSessionSchema rejeita chave proibida no superRefine", () => {
    const parsed = posTerminalSessionSchema.safeParse({ ["constructor"]: 1 })
    expect(parsed.success).toBe(false)
  })

  it("posTerminalSessionSchema aceita record plano", () => {
    expect(posTerminalSessionSchema.safeParse({ a: 1, b: null }).success).toBe(
      true
    )
  })

  it("mergeSessionData tolera base/patch ausentes", () => {
    expect(mergeSessionData(undefined, { a: 1 })).toEqual({ a: 1 })
    expect(mergeSessionData({ b: 2 }, undefined)).toEqual({ b: 2 })
    expect(mergeSessionData(undefined, undefined)).toEqual({})
  })
})
