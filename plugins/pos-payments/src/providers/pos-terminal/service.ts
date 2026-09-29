import { randomUUID } from "node:crypto"
import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
} from "@medusajs/types"
import { mergeSessionData, posTerminalSessionSchema, assertSafeSessionKeys } from "./schema"

type InjectedDependencies = {
  logger?: Logger
}

/**
 * Configuração por registro do provider (options no medusa-config). Fase 1 é
 * manual/terminal-presente: nada de credenciais. Adapters de adquirente entram
 * atrás desta opção nas fases seguintes (plano-pos-br.md §6.2).
 */
export type PosTerminalOptions = {
  /** Fase 1: "manual". Fases 2-3: "mercadopago" | "sumup" | "stone" | "cielo". */
  acquirer: string
}

type SessionData = Record<string, unknown>

/**
 * Mapa puro do `data` para o status (opcore: complexity.max-nesting). Erro de
 * leitura degrada para pending — §6.2: getPaymentStatus nunca lança.
 */
function mapStatus(data: SessionData): GetPaymentStatusOutput {
  if (data.captured_at) return { status: "captured" }
  if (data.canceled_at) return { status: "canceled" }
  if (data.authorized_at) return { status: "authorized" }
  return { status: "pending" }
}

/**
 * Provider "terminal-presente" (plano-pos-br.md §6.2): a cobrança acontece
 * fisicamente na maquininha operada pelo caixa; o backend registra o estado.
 * Nenhuma chamada externa na Fase 1.
 *
 * Contrato do módulo payment (§6.2/engenharia §1.11, verificado no fonte
 * 2.21.1): todo método devolve o blob completo que deve sobreviver — devolver
 * `{}` clobberiza o estado. `authorizePayment` roda no markAsPaid;
 * `capturePayment` em já-capturado é protegido pelo módulo;
 * `getPaymentStatus` nunca lança; o `data` de initiatePayment é público.
 */
class PosTerminalProviderService extends AbstractPaymentProvider<PosTerminalOptions> {
  static override identifier = "pos-terminal"

  protected logger_: Logger
  protected options_: PosTerminalOptions

  static override validateOptions(options: PosTerminalOptions): void {
    // Fase 1: só "manual". A lista expande quando os adapters de adquirente
    // forem implementados (Fases 2-3) — adquirente desconhecida falha no boot.
    const SUPPORTED = ["manual"]
    if (!options?.acquirer || !SUPPORTED.includes(options.acquirer)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `pos-terminal: options.acquirer deve ser um de [${SUPPORTED.join(", ")}] (recebido: ${options?.acquirer ?? "ausente"})`
      )
    }
  }

  constructor(container: InjectedDependencies, options: PosTerminalOptions) {
    super(container, options)
    this.logger_ = (container.logger ?? console) as Logger
    this.options_ = options
  }

  override async initiatePayment(
    _input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    // §6.2: no-op no modo manual — o módulo faz merge do data de entrada.
    // O id do provider é opaco e público (nunca carregar dado sensível).
    return { id: randomUUID(), data: {} }
  }

  override async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    // Fase 1: a confirmação do caixa autenticado (admin JWT, via markAsPaid) É
    // a verificação do terminal-presente — rota de autorização é admin-only.
    // Fase 2 (hardening): vincular a register_session_id/handshake do caixa.
    return {
      data: { ...(input.data ?? {}), authorized_at: new Date().toISOString() },
      status: "authorized",
    }
  }

  override async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = (input.data ?? {}) as SessionData
    if (data.captured_at) return { data }
    return { data: { ...data, captured_at: new Date().toISOString() } }
  }

  override async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    return {
      data: { ...(input.data ?? {}), refunded_at: new Date().toISOString() },
    }
  }

  override async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return {
      data: { ...(input.data ?? {}), canceled_at: new Date().toISOString() },
    }
  }

  override async deletePayment(
    _input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    // §6.2: deleção limpa o estado.
    return { data: {} }
  }

  override async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: (input.data ?? {}) as SessionData }
  }

  override async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    // O data é replayado pelo cliente — valida na fronteira antes de ecoar
    // (engenharia.md §1.5/§3.6; rejeita __proto__/constructor/prototype).
    assertSafeSessionKeys(input.data as Record<string, unknown> | undefined)
    const parsed = posTerminalSessionSchema.safeParse(input.data ?? {})
    if (!parsed.success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        parsed.error.issues.map((i) => i.message).join("; ")
      )
    }
    return { data: mergeSessionData({}, parsed.data) }
  }

  override async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    // §6.2: nunca lança — erro degrada para pending (padrão paypal-integration).
    try {
      return mapStatus((input.data ?? {}) as SessionData)
    } catch {
      return mapStatus({})
    }
  }

  override async getWebhookActionAndData(_payload: {
    data: SessionData
    rawData: Buffer
    headers: Record<string, string>
  }): Promise<{ action: "not_supported" }> {
    // Fase 1: terminal-presente não recebe webhook. Fase 2+: ações
    // "authorized"/"captured" com data.session_id obrigatórios.
    return { action: "not_supported" }
  }
}

export default PosTerminalProviderService
