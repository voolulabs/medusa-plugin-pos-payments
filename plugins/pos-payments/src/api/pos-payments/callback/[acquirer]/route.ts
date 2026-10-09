import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { exchangeCode, validateOnboardingConnection } from "../../../../adapters/mercadopago/onboarding"
import { connectValidated } from "../../../../services/onboarding/connections"
import { consumeState } from "../../../../services/onboarding/oauth-state"
import { getPluginOptions } from "../../../../utils/plugin-options"
import { OnboardingHttpClient } from "../../../../adapters/mercadopago/onboarding-client"
import { mpOnboardingConfig } from "../../../../types/onboarding-options"
import { OnboardingError } from "../../../../services/onboarding/errors"

/** GET /pos-payments/callback/:acquirer — PÚBLICA (ADR 0005): redirect do
 * navegador. Protegida pelo state single-use (§7); valida ANTES da troca do
 * code; trata error do adquirente como result=error SEM detalhe interno;
 * 302 de volta ao Admin (/app/settings/pos-payments). */
function redirect(res: MedusaResponse, acquirer: string, result: "ok" | "error"): void {
  res.redirect(
    302,
    `/app/settings/pos-payments?connection=${encodeURIComponent(acquirer)}&result=${result}`
  )
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const acquirer = req.params.acquirer ?? ""
  const query = (req.query ?? {}) as { state?: unknown; code?: unknown; error?: unknown }
  try {
    if (acquirer !== "mercadopago") return redirect(res, acquirer, "error")
    if (typeof query.error === "string" && query.error) {
      return redirect(res, acquirer, "error")
    }
    if (
      typeof query.state !== "string" ||
      !query.state ||
      typeof query.code !== "string" ||
      !query.code
    ) {
      return redirect(res, acquirer, "error")
    }
    const module = req.scope.resolve("posPayments") as never
    const consumed = await consumeState(
      module,
      query.state,
      acquirer
    )
    if (!consumed.ok) return redirect(res, acquirer, "error")
    const cfg = mpOnboardingConfig(process.env, getPluginOptions(req.scope))
    const options = getPluginOptions(req.scope)
    const http = new OnboardingHttpClient({
      ...(options.onboarding?.mercadopago?.fetchImpl
        ? { fetchImpl: options.onboarding.mercadopago.fetchImpl as typeof fetch }
        : {}),
    })
    const secret = await exchangeCode(http, cfg, query.code)
    const refs = await validateOnboardingConnection(http, secret.access_token)
    await connectValidated(module, {
      acquirer,
      secret,
      actorId: consumed.actorId,
      from: "connecting",
      validate: async () => refs,
      expiresAt: secret.expires_at ? new Date(secret.expires_at) : null,
    })
    redirect(res, acquirer, "ok")
  } catch (error) {
    if (error instanceof OnboardingError && error.status >= 500) {
      // falha nossa/de rede: mesma resposta ao navegador — o operador vê o
      // estado real na página (onboarding.md §7: sem detalhe interno vazado).
    }
    redirect(res, acquirer, "error")
  }
}
