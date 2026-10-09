import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import {
  refreshOnboardingToken,
  validateOnboardingConnection,
} from "../../../../../../adapters/mercadopago/onboarding"
import { findConnection, setStatus } from "../../../../../../services/onboarding/connections"
import { recordAudit } from "../../../../../../services/onboarding/audit"
import { getValidAccessToken } from "../../../../../../services/onboarding/refresh"
import { OnboardingError } from "../../../../../../services/onboarding/errors"
import { onboardingContext, sendOnboardingError } from "../../../onboarding-context"

/** POST /admin/pos-payments/connections/:acquirer/test (§5.1): revalida AGORA
 * com chamada barata → connected (lastValidatedAt) ou degraded/action_required.
 * Renovação lazy acontece aqui se o access token estiver perto do expiry. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const acquirer = req.params.acquirer
    if (acquirer !== "mercadopago") {
      throw new OnboardingError("not_connected", 404, "adquirente não suportado")
    }
    const { module, cfg, http, actorId } = onboardingContext(req)
    const conn = await findConnection(module, acquirer)
    if (!conn) throw new OnboardingError("not_connected", 404, "conexão inexistente")
    try {
      const token = await getValidAccessToken({
        module,
        acquirer,
        refresh: (rt) => refreshOnboardingToken(http, cfg, rt),
      })
      await validateOnboardingConnection(http, token)
      await module.updatePosPaymentsConnections([
        { id: conn.id, status: "connected", actionReason: null, lastValidatedAt: new Date(), updatedBy: actorId } as never,
      ])
      res.status(200).json({ status: "connected" })
    } catch (error) {
      if (error instanceof OnboardingError && error.code === "reauthorize") {
        throw error // refresh já marcou action_required:reauthorize + audit
      }
      await setStatus(module, conn, "degraded")
      await recordAudit(module, { event: "degraded", acquirer, actorId })
      res.status(200).json({ status: "degraded" })
    }
  } catch (error) {
    sendOnboardingError(res, error)
  }
}
