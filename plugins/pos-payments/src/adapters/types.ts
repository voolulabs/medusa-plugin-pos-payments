/** Tipos comuns dos adapters de adquirente (interface entre provider e T1..Tn). */

export type ChargeState =
  | "pending"
  | "awaiting_terminal"
  | "action_required"
  | "paid"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"

export type RetryClass =
  "retryable" | "retry_with_change" | "not_retryable" | "escalate"

export interface ChargeStatusView {
  readonly state: ChargeState
  /** Status cru da adquirente — sempre presente, para auditoria no wiring. */
  readonly rawStatus: string
  /** Id do pagamento na adquirente, quando ela o traz. */
  readonly paymentId?: string | undefined
  /** Código cru do motivo (status_detail da transação / origem do cancelamento). */
  readonly reasonCode?: string
  readonly retryClass?: RetryClass
  /** Copy pt-BR para o operador do caixa — presente quando há motivo a exibir. */
  readonly reason?: string
}

export interface CreateChargeInput {
  /** Minor units (inteiros) — CONSTRAINTS 1; adapter converte na fronteira. */
  amountMinor: number
  /** 1–64 chars [A-Za-z0-9-_], sem PII — id do payment no Medusa. */
  externalReference: string
  terminalId: string
  /** ISO-8601 PT30S–PT3H; omitido = default do server. */
  expirationTime?: string
  description?: string
  paymentMethodDefaultType?: "debit_card" | "credit_card" | "qr"
}

/** Interface comum: o provider fala ISTO, nunca a adquirente. */
export interface PosPaymentsAdapter {
  readonly acquirer: string
  createCharge(
    input: CreateChargeInput,
    idempotencyKey: string
  ): Promise<{ chargeId: string; view: ChargeStatusView }>
  getCharge(chargeId: string): Promise<ChargeStatusView>
  /** opts.allowAtTerminal = header condicional do contrato (cancel em at_terminal). */
  cancelCharge(
    chargeId: string,
    idempotencyKey: string,
    opts?: { allowAtTerminal?: boolean }
  ): Promise<ChargeStatusView>
  /** Estorno TOTAL do charge (contrato Point); recusas parciais falham no provider. */
  refundCharge(
    chargeId: string,
    idempotencyKey: string
  ): Promise<ChargeStatusView>
}
