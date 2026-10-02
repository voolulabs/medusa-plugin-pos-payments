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

/** 409 idempotency_key_already_used — o wiring re-consulta o recurso, nunca recria. */
export class MpIdempotencyConflictError extends MpApiError {
  constructor(
    message: string,
    override readonly body: unknown
  ) {
    super(message, 409, body)
    this.name = "MpIdempotencyConflictError"
  }
}
/** Mapeia a Response bruta: 409 de colisão tipado, não-2xx → MpApiError, 2xx → payload. */
export async function parseMpResponse(
  response: Response,
  method: string,
  path: string
): Promise<unknown> {
  const parsed: unknown = await response.json().catch(() => ({}))
  if (response.status === 409 && isIdempotencyConflict(parsed)) {
    throw new MpIdempotencyConflictError(
      `Mercado Pago ${method} ${path}: idempotency_key_already_used`,
      parsed
    )
  }
  if (!response.ok) {
    throw new MpApiError(
      `Mercado Pago ${method} ${path}: HTTP ${response.status}`,
      response.status,
      parsed
    )
  }
  return parsed
}

/** Violação de contrato em fronteira do adapter (entrada local ou resposta fora do schema). */
export class MpContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MpContractError"
  }
}

function isIdempotencyConflict(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { error?: unknown }).error === "idempotency_key_already_used"
  )
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
  /** Restringe o meio no terminal — contrato oficial: debit_card | credit_card | qr. */
  paymentMethodDefaultType?: "debit_card" | "credit_card" | "qr"
}
