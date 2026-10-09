import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingTax } from "@medusajs/icons"
import { ConnectionCard } from "./connection-card"
import { RegistersCard, TerminalsCard } from "./lists-cards"
import {
  disconnectAcquirer,
  loadOnboardingState,
  pasteToken,
  selectTerminal,
  startOAuth,
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

  const act = async (acao: () => Promise<void>, erro: string) => {
    setBusy(true)
    try {
      await acao()
      await reload()
      setError(null)
    } catch {
      setError(erro)
    }
    setBusy(false)
  }

  const connect = () =>
    act(async () => {
      window.location.assign((await startOAuth()).toString())
    }, "falha ao iniciar OAuth")

  const disconnect = () => act(disconnectAcquirer, "falha ao desconectar")

  const paste = () =>
    act(async () => {
      const ok = await pasteToken(pastedToken)
      setPastedToken("")
      if (!ok) throw new Error("recusada")
    }, "credencial recusada pela adquirente")

  const select = (terminalId: string) =>
    act(() => selectTerminal(terminalId), "falha ao selecionar terminal")

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
