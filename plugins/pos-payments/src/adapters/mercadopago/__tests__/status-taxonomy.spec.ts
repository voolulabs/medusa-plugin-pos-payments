import { describe, expect, it } from "vitest"
import {
  CANCEL_ORIGINS,
  QR_FORBIDDEN_STATUSES,
  RETRY_TAXONOMY,
  UNKNOWN_DETAIL,
  type RetryClass,
  type TaxonomyEntry,
} from "../status-taxonomy"

const RECUSAS_DOCUMENTADAS = [
  "insufficient_amount",
  "rejected_by_issuer",
  "high_risk",
  "bad_filled_card_data",
  "card_disabled",
  "max_attempts_exceeded",
  "amount_limit_exceeded",
  "processing_error",
  "invalid_installments",
  "in_review",
  "required_call_for_authorize",
] as const

describe("taxonomia de retentabilidade", () => {
  it("cobre as 11 recusas documentadas com copy não vazia", () => {
    for (const detail of RECUSAS_DOCUMENTADAS) {
      const entrada: TaxonomyEntry | undefined = RETRY_TAXONOMY[detail]
      expect(entrada, `entrada ausente: ${detail}`).toBeDefined()
      expect(entrada!.copy.length).toBeGreaterThan(0)
    }
  })

  it("usa exatamente as 4 classes normativas", () => {
    const classes = new Set(
      Object.values(RETRY_TAXONOMY).map((e) => e.retryClass)
    )
    expect([...classes].sort()).toEqual<RetryClass[]>([
      "escalate",
      "not_retryable",
      "retry_with_change",
      "retryable",
    ])
  })

  it("recusas de ajuste do operador ficam em retry_with_change", () => {
    for (const d of [
      "insufficient_amount",
      "amount_limit_exceeded",
      "bad_filled_card_data",
      "invalid_installments",
    ]) {
      expect(RETRY_TAXONOMY[d]!.retryClass).toBe("retry_with_change")
    }
  })

  it("recusas definitivas do emissor ficam em not_retryable", () => {
    for (const d of [
      "rejected_by_issuer",
      "card_disabled",
      "max_attempts_exceeded",
    ]) {
      expect(RETRY_TAXONOMY[d]!.retryClass).toBe("not_retryable")
    }
  })

  it("transitórias são retryable e revisões escalam para humano", () => {
    expect(RETRY_TAXONOMY.high_risk!.retryClass).toBe("retryable")
    expect(RETRY_TAXONOMY.processing_error!.retryClass).toBe("retryable")
    expect(RETRY_TAXONOMY.in_review!.retryClass).toBe("escalate")
    expect(RETRY_TAXONOMY.required_call_for_authorize!.retryClass).toBe(
      "escalate"
    )
  })

  it("degradação conservadora para detail desconhecido", () => {
    expect(UNKNOWN_DETAIL.retryClass).toBe("not_retryable")
    expect(UNKNOWN_DETAIL.copy.length).toBeGreaterThan(0)
  })

  it("estados exclusivos do Point e origens de cancelamento", () => {
    expect([...QR_FORBIDDEN_STATUSES].sort()).toEqual([
      "action_required",
      "at_terminal",
      "failed",
    ])
    expect([...CANCEL_ORIGINS].sort()).toEqual([
      "canceled_by_api",
      "canceled_on_terminal",
    ])
  })
})
