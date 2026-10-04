/** Adapter Mercado Pago da interface comum (usa o cliente T1 + status T2). */
import type {
  ChargeStatusView,
  CreateChargeInput,
  PosPaymentsAdapter,
  TerminalsListQuery,
  TerminalsPage,
} from "../types"
import { assertReusedOrder } from "./reuse-guard"
import { MercadoPagoOrdersClient } from "./client"
import { cancelOrder, refundOrder } from "./orders"
import { mapOrderStatus } from "./status"
import { recoverByIdempotencyConflict } from "./search"
import { listTerminals as listTerminalsRemote } from "./terminals"
import { toTerminalsPage } from "./terminals-page"
import { toCreateOrderInput } from "./payload"

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
    let order
    try {
      order = await this.client.createPointOrder(
        toCreateOrderInput(input),
        idempotencyKey
      )
    } catch (error) {
      // Colisão de idempotência: reconsulta por referência, nunca recria.
      order = await recoverByIdempotencyConflict(
        this.client,
        input.externalReference,
        error
      )
    }
    assertReusedOrder(order, input)
    return { chargeId: order.id, view: mapOrderStatus(order) }
  }

  async getCharge(chargeId: string): Promise<ChargeStatusView> {
    return mapOrderStatus(await this.client.getOrder(chargeId))
  }

  async cancelCharge(
    chargeId: string,
    idempotencyKey: string,
    opts?: { allowAtTerminal?: boolean }
  ): Promise<ChargeStatusView> {
    return mapOrderStatus(
      await cancelOrder(this.client, chargeId, idempotencyKey, opts)
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

  async listTerminals(query: TerminalsListQuery = {}): Promise<TerminalsPage> {
    return toTerminalsPage(await listTerminalsRemote(this.client, query))
  }
}
