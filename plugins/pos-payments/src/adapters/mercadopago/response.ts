/** Mapeia a Response bruta: 409 de colisão tipado, não-2xx → MpApiError, 2xx → payload. */
import { MpApiError, MpIdempotencyConflictError } from "./types"

export async function parseMpResponse(
  response: Response,
  method: string,
  path: string
): Promise<unknown> {
  const parsed: unknown = await response.json().catch(() => ({}))
  if (response.status === 409 && isIdempotencyConflict(parsed)) {
    throw new MpIdempotencyConflictError(
      `Mercado Pago ${method} ${path}: idempotency_key_already_used`,
      parsed
    )
  }
  if (!response.ok) {
    throw new MpApiError(
      `Mercado Pago ${method} ${path}: HTTP ${response.status}`,
      response.status,
      parsed,
      // ADR 0001: o helper respeita rate limit — 429 carrega o Retry-After.
      response.status === 429
        ? (response.headers.get("Retry-After") ?? undefined)
        : undefined
    )
  }
  return parsed
}

function isIdempotencyConflict(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { error?: unknown }).error === "idempotency_key_already_used"
  )
}
