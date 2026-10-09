import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingTax } from "@medusajs/icons"
import { ConnectionCard } from "./connection-card"
import { RegistersCard, TerminalsCard } from "./lists-cards"
import {
  api,
  loadOnboardingState,
  type OnboardingState,
} from "./onboarding-data"

/** Settings → POS Payments (ui-ux-admin.md §3): conexão por adquirente,
 * terminais e binding por caixa. Handlers curtos; UI nos cards. */
const PosPaymentsSettingsPage = () => {
  const [state, setState] = useState<OnboardingState>({
    connections: [],
    registers: {},
    terminals: [],
  })
  const [busy, setBusy] = useState(false)
  const [pastedToken, setPastedToken] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadOnboardingState()
      .then(setState)
      .catch(() => setError("falha ao carregar estado do onboarding"))
  }, [])

  const reload = async () => {
    try {
      setState(await loadOnboardingState())
      setError(null)
    } catch {
      setError("falha ao carregar estado do onboarding")
    }
  }

  const connect = async () => {
    setBusy(true)
    try {
      const { authorize_url } = await api<{ authorize_url: string }>(
        "/admin/pos-payments/connections/mercadopago/start",
        { method: "POST" }
      )
      window.location.href = authorize_url
    } catch {
      setError("falha ao iniciar OAuth")
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    await api("/admin/pos-payments/connections/mercadopago", {
      method: "DELETE",
    })
    await reload()
    setBusy(false)
  }

  const paste = async () => {
    setBusy(true)
    const res = await fetch("/admin/pos-payments/connections/mercadopago", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: pastedToken }),
    })
    setPastedToken("")
    setError(res.ok ? null : "credencial recusada pela adquirente")
    await reload()
    setBusy(false)
  }

  const select = async (terminalId: string) => {
    setBusy(true)
    await api(
      `/admin/pos-payments/terminals/${encodeURIComponent(terminalId)}/select`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    )
    await reload()
    setBusy(false)
  }

  const mp = state.connections.find((c) => c.acquirer === "mercadopago")
  return (
    <div className="flex flex-col gap-y-3">
      <ConnectionCard
        mp={mp}
        busy={busy}
        error={error}
        pastedToken={pastedToken}
        onPastedTokenChange={setPastedToken}
        onConnect={() => void connect()}
        onDisconnect={() => void disconnect()}
        onPaste={() => void paste()}
      />
      <TerminalsCard
        terminals={state.terminals}
        busy={busy}
        onSelect={(id) => void select(id)}
      />
      <RegistersCard registers={state.registers} />
    </div>
  )
}

export default PosPaymentsSettingsPage

export const config = defineRouteConfig({
  label: "POS Payments",
  icon: BuildingTax,
})
