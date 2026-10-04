import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { keyFor } from "../../../../../../providers/pos-terminal/service-mp-ops"
import { adapterForRequest } from "../../../adapter-scope"
import { assertChargeId } from "../../../schemas"
import { toMedusaError } from "../../../errors"

/**
 * POST /admin/pos-payments/charges/:id/cancel (§6.3). Header INCONDICIONAL
 * (decisão do T3): a adquirente carrega a ordem no terminal em segundos e a
 * rota não tem estado local para condicionar o allow-at-terminal.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const chargeId = assertChargeId(req.params.id)
  const adapter = adapterForRequest(req)
  try {
    const view = await adapter.cancelCharge(
      chargeId,
      keyFor(chargeId, "cancel"),
      { allowAtTerminal: true }
    )
    res.json({ chargeId, ...view })
  } catch (error) {
    throw toMedusaError(error)
  }
}
