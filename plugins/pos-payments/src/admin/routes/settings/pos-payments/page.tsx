import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-shared"
import { BuildingTax } from "@medusajs/icons"
import { Container, Heading, Button, Text, Badge, Input } from "@medusajs/ui"
import { connectionLabel } from "../../../../services/onboarding/labels"

/** GET/POST helpers same-origin — o dashboard autentica por cookie de sessão
 * (ADR 0005: js-sdk session não envia Authorization). */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  })
  return (await res.json()) as T
}

interface ConnectionView {
  acquirer: string
  status: string
  actionReason: string | null
  lastValidatedAt: string | null
}

interface RegisterMap {
  [registerId: string]: { label?: string; terminal?: { acquirer: string; id: string } }
}

type UiState = {
  connections: ConnectionView[]
  registers: RegisterMap
  terminals: Array<{ id: string; name?: string }>
  busy: boolean
  pastedToken: string
  error: string | null
}

export default function PosPaymentsSettingsPage() {
  const [ui, setUi] = useState<UiState>({
    connections: [],
    registers: {},
    terminals: [],
    busy: false,
    pastedToken: "",
    error: null,
  })

  const reload = async () => {
    try {
      const [conns, regs, terms] = await Promise.all([
        api<{ connections: ConnectionView[] }>("/admin/pos-payments/connections"),
        api<{ registers: RegisterMap }>("/admin/pos-payments/registers"),
        api<{ terminals: Array<{ id: string }> }>("/admin/pos-payments/terminals"),
      ])
      setUi((s) => ({
        ...s,
        connections: conns.connections ?? [],
        registers: regs.registers ?? {},
        terminals: terms.terminals ?? [],
        error: null,
      }))
    } catch {
      setUi((s) => ({ ...s, error: "falha ao carregar estado do onboarding" }))
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const connect = async () => {
    setUi((s) => ({ ...s, busy: true }))
    try {
      const { authorize_url } = await api<{ authorize_url: string }>(
        "/admin/pos-payments/connections/mercadopago/start",
        { method: "POST" }
      )
      window.location.href = authorize_url
    } catch {
      setUi((s) => ({ ...s, busy: false, error: "falha ao iniciar OAuth" }))
    }
  }

  const disconnect = async () => {
    setUi((s) => ({ ...s, busy: true }))
    await fetch("/admin/pos-payments/connections/mercadopago", {
      method: "DELETE",
      credentials: "include",
    })
    await reload()
    setUi((s) => ({ ...s, busy: false }))
  }

  const paste = async () => {
    setUi((s) => ({ ...s, busy: true }))
    const res = await fetch("/admin/pos-payments/connections/mercadopago", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: ui.pastedToken }),
    })
    setUi((s) => ({
      ...s,
      busy: false,
      pastedToken: "",
      error: res.ok ? null : "credencial recusada pela adquirente",
    }))
    await reload()
  }

  const select = async (terminalId: string) => {
    setUi((s) => ({ ...s, busy: true }))
    await fetch(`/admin/pos-payments/terminals/${encodeURIComponent(terminalId)}/select`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    await reload()
    setUi((s) => ({ ...s, busy: false }))
  }

  const mp = ui.connections.find((c) => c.acquirer === "mercadopago")

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">POS Payments — Mercado Pago</Heading>
          {mp?.status === "connected" ? (
            <Button variant="secondary" size="small" disabled={ui.busy} onClick={() => void disconnect()}>
              Desconectar
            </Button>
          ) : (
            <Button size="small" disabled={ui.busy} onClick={() => void connect()}>
              Conectar (OAuth)
            </Button>
          )}
        </div>
        <div className="px-6 py-4">
          <Text>
            Estado: <Badge color={mp?.status === "connected" ? "green" : "orange"}>
              {connectionLabel((mp?.status ?? "unconfigured") as never, {
                actionReason: mp?.actionReason,
              })}
            </Badge>
          </Text>
          {mp?.status !== "connected" && (
            <div className="mt-3 flex items-center gap-x-2">
              <Input
                placeholder="token do lojista (credencial colada — opcional)"
                value={ui.pastedToken}
                type="password"
                onChange={(e) => setUi((s) => ({ ...s, pastedToken: e.target.value }))}
              />
              <Button variant="secondary" size="small" disabled={ui.busy || ui.pastedToken.length < 20} onClick={() => void paste()}>
                Validar e conectar
              </Button>
            </div>
          )}
          {ui.error && <Text size="small" className="text-ui-fg-error">{ui.error}</Text>}
        </div>
      </Container>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h3">Terminais do lojista</Heading>
        </div>
        <div className="px-6 pb-4 flex flex-col gap-y-2">
          {ui.terminals.map((t) => (
            <div key={t.id} className="flex items-center justify-between border rounded px-3 py-2">
              <Text size="small">{t.id}</Text>
              <Button variant="secondary" size="small" disabled={ui.busy} onClick={() => void select(t.id)}>
                Selecionar
              </Button>
            </div>
          ))}
          {ui.terminals.length === 0 && (
            <Text size="small">Nenhum terminal listado — conecte e pareie a maquininha no app Mercado Pago.</Text>
          )}
        </div>
      </Container>
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h3">Terminais por caixa</Heading>
        </div>
        <div className="px-6 pb-4 flex flex-col gap-y-2">
          {Object.entries(ui.registers).map(([rid, info]) => (
            <div key={rid} className="flex items-center justify-between border rounded px-3 py-2">
              <Text size="small">{info.label ?? rid} → {info.terminal?.id ?? "sem terminal"}</Text>
            </div>
          ))}
          {Object.keys(ui.registers).length === 0 && (
            <Text size="small">Os caixas aparecem aqui quando o app de caixa reporta o register_id.</Text>
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "POS Payments",
  icon: BuildingTax,
})
