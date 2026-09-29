/**
 * Opcoes do plugin. Fase 1 (provider manual/terminal-presente) nao exige nada:
 * as credenciais de adquirente chegam por adapter nas fases seguintes e vivem
 * SEMPRE no backend (nunca no app de caixa) - ver plano-pos-br.md §2/§9.
 */
export type PosPaymentsPluginOptions = {
  /** Ambientes sandbox por adquirente (futuro). */
  sandbox?: boolean
}
