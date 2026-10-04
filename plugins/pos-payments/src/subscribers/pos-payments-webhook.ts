/** Subscriber do plugin: reconcilia refund originado no terminal (T5, ADR 0007). */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { PosPaymentsAdapter } from "../adapters/types"
import { resolveAdapter } from "../adapters"
import { getPluginOptions } from "../utils/plugin-options"
import { parseEnvelope } from "../providers/pos-terminal/service-webhook"
import { validateWebhookSignature } from "../providers/pos-terminal/webhook-signature"
import { reconcileTerminalRefund } from "../providers/pos-terminal/webhook-reconcile"

type WebhookEvent = {
  provider: string
  payload: {
    data: Record<string, unknown>
    /** O event bus persistido entrega o Buffer serializado (mesma forma que o
     * subscriber do core re-hidrata antes de chamar o provider). */
    rawData: Buffer | { type: string; data: number[] }
    headers: Record<string, string>
  }
}

type SessionPayment = {
  id: string
  captured_at?: string | null
  refunds?: { id: string }[] | null
}

/** Re-hidrata o Buffer serializado do event bus (idempotente p/ Buffer real). */
function coerceRawData(raw: WebhookEvent["payload"]["rawData"]): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  return Array.isArray(raw?.data) ? Buffer.from(raw.data) : Buffer.alloc(0)
}

type HandlerDeps = {
  getAdapter(): PosPaymentsAdapter | undefined
  getSecret(): string
  logger: { warn(msg: string, ctx?: Record<string, unknown>): void }
  findPaymentBySession(sessionId: string): Promise<SessionPayment | undefined>
  refundTotal(paymentId: string): Promise<unknown>
}

/** Fiação testável: as dependências vêm de fora (nada de mock de módulo). */
export function createHandler(deps: HandlerDeps) {
  return async ({ event }: { event: { data: WebhookEvent } }) => {
    if (event.data.provider !== "pp_pos-terminal_mercadopago") return
    const adapter = deps.getAdapter()
    if (!adapter) return
    const payload = event.data.payload
    const { id } = parseEnvelope(coerceRawData(payload.rawData))
    const assinado =
      id !== undefined &&
      validateWebhookSignature(
        payload.headers,
        { data: { id } },
        deps.getSecret()
      )
    if (!assinado) {
      deps.logger.warn("mercadopago: reconciliacao descartada (assinatura)", {
        provider_id: event.data.provider,
        charge_id: id ?? "ausente",
      })
      return
    }
    try {
      const view = await adapter.getCharge(id!)
      const outcome = await reconcileTerminalRefund(view, {
        findPaymentBySession: deps.findPaymentBySession,
        refundTotal: deps.refundTotal,
      })
      if (outcome.action === "skipped") {
        deps.logger.warn("mercadopago: reconciliacao pulada", {
          provider_id: event.data.provider,
          charge_id: id,
          motivo: outcome.motivo,
        })
      }
    } catch (error) {
      deps.logger.warn("mercadopago: reconciliacao falhou", {
        provider_id: event.data.provider,
        charge_id: id,
        detail: String(error).slice(0, 160),
      })
      // Re-lança: falha transitória (re-fetch, workflow) tem que consumir as
      // tentativas do event bus — a reconciliação é o único caminho do refund
      // de terminal. Falhas permanentes (assinatura, sessão) nunca chegam aqui.
      throw error
    }
  }
}

export default async function posPaymentsWebhook({
  event,
  container,
}: SubscriberArgs<WebhookEvent>) {
  const options = getPluginOptions(container as never)
  const posTerminal = options.posTerminal
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const run = createHandler({
    // Lazy: o adapter resolve SÓ para eventos do nosso provider — options
    // quebradas (sem accessToken) não podem derrubar webhooks de outros
    // providers no event bus.
    getAdapter: () =>
      posTerminal?.acquirer === "mercadopago"
        ? resolveAdapter("mercadopago", {
            accessToken: posTerminal.accessToken,
            ...(posTerminal.fetchImpl
              ? { fetchImpl: posTerminal.fetchImpl }
              : {}),
          })
        : undefined,
    getSecret: () => posTerminal?.webhookSecret ?? "",
    logger,
    findPaymentBySession: async (sessionId) => {
      const { data } = await query.graph({
        entity: "payment",
        fields: ["id", "captured_at", "refunds.id"],
        // session_id do action = id da payment session (subscriber do core);
        // a coluna do payment é payment_session_id (única, índice parcial).
        filters: { payment_session_id: sessionId },
      })
      return data[0] as SessionPayment | undefined
    },
    refundTotal: async (paymentId) => {
      // Idempotência no engine: redelivery do event bus com a mesma chave não
      // re-executa o workflow concluído (a guarda de refunds do payment cobre
      // os casos posteriores). O transactionId existe no engine
      // (WorkflowOrchestratorRunDTO) mas o FlowRunOptions do sdk ainda não o
      // expõe — cast local.
      await refundPaymentWorkflow(container).run({
        input: { payment_id: paymentId },
        transactionId: `pos-payments-reconcile:${paymentId}`,
      } as never)
    },
  })
  await run({ event })
}

export const config: SubscriberConfig = {
  event: "payment.webhook_received",
}
