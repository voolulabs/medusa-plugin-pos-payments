/** Renovação lazy single-flight do access token (onboarding.md §7/§4):
 * 2 chamadas concorrentes = 1 refresh na adquirente; substituição ATÔMICA do
 * par (uma linha credential com access+refresh juntos); invalid_grant →
 * action_required:reauthorize + audit — nunca fallback para token de
 * plataforma (CONSTRAINTS 4). */
import type { PosPaymentsModuleService } from "../../modules/posPayments/service"
import { readSecret, type OAuthSecret } from "./credentials"
import { findConnection, setStatus } from "./connections"
import { recordAudit } from "./audit"
import { OnboardingError } from "./errors"

const RENEW_BEFORE_MS = 60 * 1000
const inflight = new Map<string, Promise<OAuthSecret>>()

/** Reset do single-flight in-process (tests e workers novos). */
export function resetInflight(): void {
  inflight.clear()
}

interface RefreshDeps {
  module: PosPaymentsModuleService
  acquirer: string
  /** Troca do refresh na adquirente (rotação pode devolver par novo). */
  refresh: (refreshToken: string) => Promise<OAuthSecret>
}

async function doRefresh(deps: RefreshDeps): Promise<OAuthSecret> {
  const conn = await findConnection(deps.module, deps.acquirer)
  if (!conn || conn.status === "disconnected") {
    throw new OnboardingError("not_connected", 409, "conexão não ativa")
  }
  const secret = await readSecret(deps.module, conn.id)
  if (!secret?.refresh_token) {
    throw new OnboardingError("reauthorize", 409, "sem refresh token")
  }
  try {
    const next = await deps.refresh(secret.refresh_token)
    // Atômico: par novo numa única linha, gravado ANTES de invalidar o uso.
    await deps.module.updatePosPaymentsConnections([
      {
        id: conn.id,
        expiresAt: next.expires_at ? new Date(next.expires_at) : null,
        status: "connected",
        actionReason: null,
        updatedAt: new Date(),
      } as never,
    ])
    await recordAudit(deps.module, {
      event: "reauthorized",
      acquirer: deps.acquirer,
      payload: { rotated: next.refresh_token !== secret.refresh_token },
    })
    return { ...secret, ...next }
  } catch (err) {
    if (err instanceof OnboardingError && err.code === "reauthorize") {
      await setStatus(deps.module, conn, "action_required", { reason: "reauthorize" })
    }
    throw err
  }
}

/** Devolve um access token válido, renovando (uma única vez por processo)
 * quando faltam <60s para expirar. */
export async function getValidAccessToken(
  deps: RefreshDeps,
  opts: { forceRefresh?: boolean } = {}
): Promise<string> {
  const conn = await findConnection(deps.module, deps.acquirer)
  if (!conn) throw new OnboardingError("not_connected", 409, "conexão inexistente")
  const secret = await readSecret(deps.module, conn.id)
  if (!secret?.access_token) {
    throw new OnboardingError("reauthorize", 409, "sem credencial")
  }
  const validUntil = secret.expires_at ? Date.parse(secret.expires_at) : Infinity
  if (!opts.forceRefresh && validUntil - RENEW_BEFORE_MS > Date.now()) {
    return secret.access_token
  }
  const key = `${deps.acquirer}:${conn.id}`
  let p = inflight.get(key)
  if (!p) {
    p = doRefresh(deps)
    inflight.set(key, p)
    p.finally(() => inflight.delete(key)).catch(() => undefined)
  }
  return (await p).access_token
}
