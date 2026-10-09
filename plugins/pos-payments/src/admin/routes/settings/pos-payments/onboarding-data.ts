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

export async function startOAuth(): Promise<string> {
  const { authorize_url } = await api<{ authorize_url: string }>(
    "/admin/pos-payments/connections/mercadopago/start",
    { method: "POST" }
  )
  // Open redirect: a URL só pode ser a autorização oficial do MP (base fixa
  // do adapter) — resposta da API nunca vai ao navegador sem esta guarda.
  const url = new URL(authorize_url)
  if (
    url.origin !== "https://auth.mercadopago.com" ||
    url.pathname !== "/authorization"
  ) {
    throw new Error("authorize_url inesperada")
  }
  return authorize_url
}

export async function pasteToken(token: string): Promise<boolean> {
  const res = await fetch("/admin/pos-payments/connections/mercadopago", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: token }),
  })
  return res.ok
}

export async function disconnectAcquirer(): Promise<void> {
  await api("/admin/pos-payments/connections/mercadopago", { method: "DELETE" })
}

export async function selectTerminal(terminalId: string): Promise<void> {
  await api(
    `/admin/pos-payments/terminals/${encodeURIComponent(terminalId)}/select`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  )
}
