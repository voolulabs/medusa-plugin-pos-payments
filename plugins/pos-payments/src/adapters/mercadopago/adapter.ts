/** Adapter Mercado Pago da interface comum (POS o cliente T1 + status T2 falam). */
import type {
  ChargeStatusView,
  CreateChargeInput,
  PosPaymentsAdapter,
} from "../types"
import { MercadoPagoOrdersClient } from "./client"
import { minorUnitsToDecimalString } from "./money"
import { cancelOrder, refundOrder } from "./orders"
import { mapOrderStatus } from "./status"

interface MpAdapterOptions {
  accessToken: string
  fetchImpl?: typeof fetch
  /** Timeout duro por chamada — padrão 15s (orçamento do app de caixa). */
  timeoutMs?: number
}

/** Point captura no processamento: capture do adapter é confirmação LOCAL (sem POST). */
export class MercadoPagoAdapter implements PosPaymentsAdapter {
  readonly acquirer = "mercadopago"
  private readonly client: MercadoPagoOrdersClient

  constructor(options: MpAdapterOptions) {
    this.client = new MercadoPagoOrdersClient({
      accessToken: options.accessToken,
      ...(options.fetchImpl !== undefined
        ? { fetchImpl: options.fetchImpl }
        : {}),
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
    })
  }

  async createCharge(
    input: CreateChargeInput,
    idempotencyKey: string
  ): Promise<{ chargeId: string; view: ChargeStatusView }> {
    const order = await this.client.createPointOrder(
      {
        amount: minorUnitsToDecimalString(input.amountMinor),
        externalReference: input.externalReference,
        terminalId: input.terminalId,
        ...(input.expirationTime
          ? { expirationTime: input.expirationTime }
          : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.paymentMethodDefaultType
          ? { paymentMethodDefaultType: input.paymentMethodDefaultType }
          : {}),
      },
      idempotencyKey
    )
    return { chargeId: order.id, view: mapOrderStatus(order) }
  }

  async getCharge(chargeId: string): Promise<ChargeStatusView> {
    return mapOrderStatus(await this.client.getOrder(chargeId))
  }

  async cancelCharge(
    chargeId: string,
    idempotencyKey: string
  ): Promise<ChargeStatusView> {
    return mapOrderStatus(
      await cancelOrder(this.client, chargeId, idempotencyKey)
    )
  }

  async refundCharge(
    chargeId: string,
    idempotencyKey: string
  ): Promise<ChargeStatusView> {
    // Contrato Point: estorno TOTAL — o provider recusa parcial ANTES de chamar.
    return mapOrderStatus(
      await refundOrder(this.client, chargeId, idempotencyKey)
    )
  }
}
