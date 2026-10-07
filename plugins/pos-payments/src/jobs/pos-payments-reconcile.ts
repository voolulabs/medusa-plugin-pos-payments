/**
 * A7 (W2.2): job de conciliação periódica — elimina a aresta "refund de
 * terminal perdido após esgotar o event bus" DENTRO DA JANELA de 30 dias
 * (refund na MP vale até 90 dias p/ cartão físico, mercado-pago.md §4.4 — o
 * resíduo 31–90d continua dependendo do reenvio do MP; janela configurável é
 * follow-up). Varre os PAYMENTS capturados do provider (o estado do charge
 * vive em `payment.data`, gravado por mpCapture/mpRefund), re-fetcha o charge
 * na adquirente e reconcilia refunds perdidos com a MESMA decisão idempotente
 * do subscriber (ADR 0007). Volume esperado: 1 GET por payment capturado por
 * execução (sequencial, client com timeout 15s).
 *
 * Schedule diário 04:00 (fora da janela de pico do varejo); a proteção em
 * profundidade do host (`webhook_retries`/`webhook_delay` no módulo payment —
 * README) cobre a janela entre as entregas. Cron configurável entra com
 * telemetria (gatilho D1–D8 de observabilidade.md). Primeiro job do plugin:
 * errata 2026-10-07 no ADR 0002 (errata 3 de 2026-10-01 deixava jobs fora).
 */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import type { PosPaymentsAdapter } from "../adapters/types"
import { resolveAdapter } from "../adapters"
import { getPluginOptions } from "../utils/plugin-options"
import {
  createReconcileRunner,
  toCapturedPayment,
} from "../providers/pos-terminal/reconcile-runner"
import type { CapturedPaymentRow } from "../providers/pos-terminal/reconcile-runner"

const PROVIDER_ID = "pp_pos-terminal_mercadopago"
/** Janela da varredura: bem dentro dos 90 dias de refund de cartão físico da
 * MP (mercado-pago.md §4.4) e curta o bastante para crescer de forma limitada. */
const JANELA_DIAS = 30

export default async function posPaymentsReconcile(
  container: MedusaContainer
): Promise<void> {
  const options = getPluginOptions(container as never)
  const posTerminal = options.posTerminal
  // Presence-gated (CONSTRAINTS 4): sem adapter configurado o job termina
  // silencioso — webhooks/conciliação de outros providers não são afetados.
  if (posTerminal?.acquirer !== "mercadopago" || !posTerminal.accessToken) {
    return
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as
    Logger | undefined
  if (!logger) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const adapter = resolveAdapter("mercadopago", {
    accessToken: posTerminal.accessToken,
    testMode: posTerminal.mpPointTestMode === true,
    ...(posTerminal.fetchImpl ? { fetchImpl: posTerminal.fetchImpl } : {}),
  })
  if (!adapter) return
  const corte = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000)
  const run = createReconcileRunner({
    getAdapter: () => adapter,
    listCapturedPayments: async () => {
      // Filtro de COLUNA no graph (captured_at é OperatorMap em
      // FilterablePaymentProps 2.19); o recorte JSONB (`data.state === "paid"`,
      // gravado por mpCapture) é em memória — JSONB não é filtrável (ADR 0002).
      const { data } = await query.graph({
        entity: "payment",
        fields: ["id", "payment_session_id", "data", "captured_at"],
        filters: { provider_id: PROVIDER_ID, captured_at: { $gte: corte } },
      })
      return (
        data as never as Array<{
          id: string
          payment_session_id: string
          data: { charge_id?: unknown; state?: unknown }
        }>
      )
        .map(toCapturedPayment)
        .filter((row): row is CapturedPaymentRow => row !== undefined)
    },
    findPaymentByPaymentId: async (paymentId) => {
      // Mesmo caminho do subscriber (provado no L3): graph sobre `payment`.
      const { data } = await query.graph({
        entity: "payment",
        fields: ["id", "captured_at", "refunds.id"],
        filters: { id: paymentId },
      })
      return data[0] as { id: string; captured_at?: string | null } | undefined
    },
    refundTotal: async (paymentId) => {
      // Mesma transactionId do subscriber — re-execução do job com o mesmo
      // payment não re-executa o refund no engine (lock do core cobre o
      // paralelismo job×subscriber — resíduo T5, revisão no T6).
      await refundPaymentWorkflow(container).run({
        input: { payment_id: paymentId },
        transactionId: `pos-payments-reconcile:${paymentId}`,
      } as never)
    },
    logger: logger as never,
  })
  const outcomes = await run()
  const reembolsados = outcomes.filter((o) => o.action === "refunded").length
  ;(logger as unknown as { info(msg: string, meta?: object): void }).info(
    "mercadopago: conciliação periódica concluída",
    { provider_id: PROVIDER_ID, payments: outcomes.length, reembolsados }
  )
}

export const config = {
  name: "pos-payments-reconcile",
  schedule: "0 4 * * *",
}
