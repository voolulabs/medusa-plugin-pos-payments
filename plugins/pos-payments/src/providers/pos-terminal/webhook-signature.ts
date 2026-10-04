/** Validação x-signature da MP (mercado-pago.md §5): HMAC-SHA256 hex timing-safe. */
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Canonical `id:{data.id};request-id:{x-request-id};ts:{ts};` — sem expiração
 * (doc oficial; renovação do secret via Reset no DevPanel).
 */
export function validateWebhookSignature(
  headers: Record<string, string>,
  envelope: { data?: { id?: unknown } },
  secret: string
): boolean {
  const parts = Object.fromEntries(
    (headers["x-signature"] ?? "")
      .split(",")
      .map((parte) => parte.split("=", 2).map((s) => s.trim()))
  )
  const ts = parts["ts"]
  const v1 = parts["v1"]
  const requestId = headers["x-request-id"]
  const id = envelope.data?.id
  if (!ts || !v1 || !requestId || !secret || id === undefined) {
    return false
  }
  const canonical = `id:${id};request-id:${requestId};ts:${ts};`
  const esperado = createHmac("sha256", secret).update(canonical).digest("hex")
  const a = Buffer.from(esperado, "utf8")
  const b = Buffer.from(v1.toLowerCase(), "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}
