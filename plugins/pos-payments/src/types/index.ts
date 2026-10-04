/**
 * Opcoes do plugin. Fase 1 (provider manual/terminal-presente) nao exige nada:
 * as credenciais de adquirente chegam por adapter nas fases seguintes e vivem
 * SEMPRE no backend (nunca no app de caixa).
 */
export type PosPaymentsPluginOptions = {
  /** Ambientes sandbox por adquirente (futuro). */
  sandbox?: boolean
  /**
   * Adapter das rotas admin (§6.3) — espelha as options do provider no
   * medusa-config (providers do módulo payment não são resolvíveis do
   * container; verificado no @medusajs/payment 2.19). Ausente/manual: as
   * rotas de charges/terminals respondem NOT_ALLOWED.
   */
  posTerminal?: {
    acquirer?: string
    accessToken?: string
    /** Seam de teste — fetch injetado (produção usa o global). */
    fetchImpl?: typeof fetch
  }
}

// Contrato do session data do provider (ADR 0002: contrato sai por ./types)
export type { PosTerminalSessionData } from "../providers/pos-terminal/schema"
