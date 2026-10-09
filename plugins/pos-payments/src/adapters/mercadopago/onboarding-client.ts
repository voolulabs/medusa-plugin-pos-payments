/** Transporte do onboarding — independente do client de cobrança: as rotas
 * OAuth/stores PRECISAM funcionar sem o token de plataforma do provider
 * (a 2b existe para não depender dele). Base fixa https (SSRF: sem override,
 * engenharia.md §3.4.5); timeout 15s (orçamento do app). */

const DEFAULT_TIMEOUT_MS = 15_000

interface OnboardingHttpResult {
  status: number
  body: unknown
}

export class OnboardingHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly mpError: string | null,
    message: string
  ) {
    super(message)
    this.name = "OnboardingHttpError"
  }
}

interface OnboardingHttpOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class OnboardingHttpClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(opts: OnboardingHttpOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "https://api.mercadopago.com"
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async request(
    method: string,
    path: string,
    init: {
      headers?: Record<string, string>
      /** application/x-www-form-urlencoded (exigido em /oauth/token). */
      form?: URLSearchParams
      json?: unknown
    } = {}
  ): Promise<OnboardingHttpResult> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      ...(init.form
        ? { body: init.form.toString() }
        : init.json !== undefined
          ? { body: JSON.stringify(init.json) }
          : {}),
    })
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!response.ok) {
      const err = (body ?? {}) as { error?: string; message?: string }
      throw new OnboardingHttpError(
        response.status,
        typeof err.error === "string" ? err.error : null,
        err.message ?? `MP onboarding HTTP ${response.status}`
      )
    }
    return { status: response.status, body }
  }
}
