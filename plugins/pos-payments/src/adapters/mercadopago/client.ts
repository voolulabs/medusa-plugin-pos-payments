import {
  MpApiError,
  MpContractError,
  type MpOrder,
  type CreatePointOrderInput,
} from "./types"
import {
  assertAmount,
  assertDescription,
  assertExternalReference,
} from "./validation"

const MP_API_BASE_URL = "https://api.mercadopago.com"

interface MercadoPagoOrdersClientOptions {
  accessToken: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  idempotencyKeyFactory?: () => string
}

export class MercadoPagoOrdersClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly idempotencyKeyFactory: () => string

  constructor(private readonly options: MercadoPagoOrdersClientOptions) {
    if (!options.accessToken)
      throw new MpContractError("accessToken é obrigatório")
    this.baseUrl = options.baseUrl ?? MP_API_BASE_URL
    this.fetchImpl = options.fetchImpl ?? fetch
    this.idempotencyKeyFactory =
      options.idempotencyKeyFactory ?? (() => crypto.randomUUID())
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
    extraHeaders?: Record<string, string>
  ): Promise<MpOrder> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const parsed = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new MpApiError(
        `Mercado Pago ${method} ${path}: HTTP ${response.status}`,
        response.status,
        parsed
      )
    }
    return parsed as MpOrder
  }

  async createPointOrder(input: CreatePointOrderInput): Promise<MpOrder> {
    assertAmount(input.amount)
    assertExternalReference(input.externalReference)
    if (input.description !== undefined) assertDescription(input.description)
    const paymentMethod = input.paymentMethodDefaultType
      ? { payment_method: { default_type: input.paymentMethodDefaultType } }
      : {}
    return this.request(
      "POST",
      "/v1/orders",
      {
        type: "point",
        external_reference: input.externalReference,
        ...(input.expirationTime
          ? { expiration_time: input.expirationTime }
          : {}),
        transactions: { payments: [{ amount: input.amount }] },
        config: {
          point: {
            terminal_id: input.terminalId,
            ...(input.printOnTerminal
              ? { print_on_terminal: input.printOnTerminal }
              : {}),
          },
          ...paymentMethod,
        },
        ...(input.description ? { description: input.description } : {}),
      },
      this.idempotencyKeyFactory()
    )
  }

  async getOrder(orderId: string): Promise<MpOrder> {
    return this.request("GET", `/v1/orders/${encodeURIComponent(orderId)}`)
  }

  async cancelOrder(
    orderId: string,
    cancelableStatuses?: string[]
  ): Promise<MpOrder> {
    const headers = cancelableStatuses?.length
      ? { "X-Allow-Cancelable-Status": cancelableStatuses.join(",") }
      : undefined
    return this.request(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      undefined,
      this.idempotencyKeyFactory(),
      headers
    )
  }

  async refundOrder(orderId: string): Promise<MpOrder> {
    return this.request(
      "POST",
      `/v1/orders/${encodeURIComponent(orderId)}/refund`,
      undefined,
      this.idempotencyKeyFactory()
    )
  }
}
