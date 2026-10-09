/** Dados da página settings/pos-payments: fetch same-origin com cookie de
 * sessão (ADR 0005 — js-sdk session não envia Authorization). */

export interface ConnectionView {
  acquirer: string
  status: string
  actionReason: string | null
  lastValidatedAt: string | null
}

export interface RegisterEntry {
  label?: string
  terminal?: { acquirer: string; id: string }
}

export type RegisterMap = Record<string, RegisterEntry>

export interface TerminalView {
  id: string
}

export interface OnboardingState {
  connections: ConnectionView[]
  registers: RegisterMap
  terminals: TerminalView[]
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.body) headers["Content-Type"] = "application/json"
  const res = await fetch(path, { credentials: "include", headers, ...init })
  return (await res.json()) as T
}

export async function loadOnboardingState(): Promise<OnboardingState> {
  const [conns, regs, terms] = await Promise.all([
    api<{ connections: ConnectionView[] }>("/admin/pos-payments/connections"),
    api<{ registers: RegisterMap }>("/admin/pos-payments/registers"),
    api<{ terminals: TerminalView[] }>("/admin/pos-payments/terminals"),
  ])
  return {
    connections: conns.connections ?? [],
    registers: regs.registers ?? {},
    terminals: terms.terminals ?? [],
  }
}
