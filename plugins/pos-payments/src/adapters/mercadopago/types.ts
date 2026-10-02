/** Estados de ordem da Orders API do Mercado Pago (docs Point/Orders, 2026-08). */
export type MpOrderStatus =
  | "created"
  | "at_terminal"
  | "processed"
  | "canceled"
  | "expired"
  | "action_required"
  | "failed"
  | "refunded"

export interface MpOrderPayment {
  id: string
  amount: string
  status?: string
  status_detail?: string
}

/** Forma da ordem que o adapter consome (subset do contrato oficial). */
export interface MpOrder {
  id: string
  status: MpOrderStatus
  type?: string
  external_reference?: string
  description?: string
  transactions?: { payments?: MpOrderPayment[] }
}

export class MpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message)
    this.name = "MpApiError"
  }
}

/** Violação de contrato em fronteira do adapter (entrada local ou resposta fora do schema). */
export class MpContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MpContractError"
  }
}

export interface CreatePointOrderInput {
  amount: string
  description?: string
  /** 1–64 chars [A-Za-z0-9-_], sem PII — echo do id do charge no Medusa. */
  externalReference: string
  terminalId: string
  /** ISO-8601 PT30S–PT3H; omitido = default do server (15 min). */
  expirationTime?: string
  printOnTerminal?: "seller_ticket" | "no_ticket"
  /** Restringe o meio no terminal — "qr" limita a QR/Pix (contrato oficial Orders API). */
  paymentMethodDefaultType?:
    "debit_card" | "credit_card" | "voucher_card" | "qr"
}
