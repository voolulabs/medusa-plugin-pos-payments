import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GET as listStores, POST as createStoreRoute } from "../stores/route"
import { GET as listPos, POST as createPosRoute } from "../stores/pos/route"
import { GET as listRoute } from "../connections/route"
import { POST as startRoute } from "../connections/[acquirer]/start/route"
import { POST as testRoute } from "../connections/[acquirer]/test/route"
import { POST as selectRoute } from "../terminals/[id]/select/route"
import { GET as registersGet, POST as registersPost } from "../registers/route"
import { registersOf } from "../registers/route"
import { sendOnboardingError, merchantCredentials } from "../onboarding-context"
import { connectValidated } from "../../../../services/onboarding/connections"
import { getValidAccessToken, resetInflight } from "../../../../services/onboarding/refresh"
import { OnboardingError } from "../../../../services/onboarding/errors"
import { fakeFetch, withTestKey } from "../../../../services/onboarding/__tests__/helpers"
import { fakeReq, fakeRes, fakeScope, newModule, withOnboardingEnv } from "./helpers"
import { GET as callbackGet } from "../../../pos-payments/callback/[acquirer]/route"

describe("gaps de branches das rotas de onboarding", () => {
  let mod: ReturnType<typeof newModule>
  let scope: ReturnType<typeof fakeScope>
  let original: typeof fetch
  beforeEach(async () => {
    mod = newModule()
    withTestKey()
    withOnboardingEnv()
    scope = fakeScope({ module: mod })
    resetInflight()
  })
  afterEach(() => {
    globalThis.fetch = original
  })

  it("stores GET sem filtro; POST com location/businessHours e corpo inválido", async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: { results: [] } }))
    original = globalThis.fetch
    globalThis.fetch = fetchImpl
    await connectValidated(mod.svc as never, {
      acquirer: "mercadopago",
      secret: { access_token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() },
      actorId: null,
      from: "unconfigured",
      validate: async () => ({ user_id: "5" }),
    })
    const listed = fakeRes()
    await listStores(fakeReq({}, scope, { query: {} }), listed as never)
    expect(listed.code).toBe(200)
    const created = fakeRes()
    await createStoreRoute(
      fakeReq({}, scope, {
        body: { name: "L", externalId: "u1", location: { city_name: "x" }, businessHours: { mon: [] } },
      }),
      created as never
    )
    expect(created.code).toBe(201)
    const invalid = fakeRes()
    await createStoreRoute(fakeReq({}, scope, { body: { name: "", externalId: "bad!" } }), invalid as never)
    expect(invalid.code).toBe(400)
  })

  it("pos GET com store_id; POST com name; POST inválido (regex) → 400", async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: { results: [] } }))
    original = globalThis.fetch
    globalThis.fetch = fetchImpl
    await connectValidated(mod.svc as never, {
      acquirer: "mercadopago",
      secret: { access_token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() },
      actorId: null,
      from: "unconfigured",
      validate: async () => ({ user_id: "5" }),
    })
    const listed = fakeRes()
    await listPos(fakeReq({}, scope, { query: { store_id: "11", external_store_id: "x" } }), listed as never)
    expect(listed.code).toBe(200)
    const created = fakeRes()
    await createPosRoute(
      fakeReq({}, scope, { body: { name: "CX", externalId: "s1", externalStoreId: "u1" } }),
      created as never
    )
    expect(created.code).toBe(201)
    const invalid = fakeRes()
    await createPosRoute(fakeReq({}, scope, { body: { externalId: "bad!" } }), invalid as never)
    expect(invalid.code).toBe(400)
  })

  it("start/test com adquirente não suportado → 404; test degrada em 5xx do /users/me", async () => {
    const res = fakeRes()
    await startRoute(fakeReq({ acquirer: "stone" }, scope), res as never)
    expect(res.code).toBe(404)
    const { fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/oauth/token")
        ? { body: { access_token: "n", expires_in: 3600 } }
        : { status: 502, body: { error: "boom" } }
    )
    original = globalThis.fetch
    globalThis.fetch = fetchImpl
    await connectValidated(mod.svc as never, {
      acquirer: "mercadopago",
      secret: { access_token: "old", refresh_token: "rt", expires_at: new Date(Date.now() + 1000).toISOString() },
      actorId: null,
      from: "unconfigured",
      validate: async () => ({ user_id: "5" }),
    })
    const degraded = fakeRes()
    await testRoute(fakeReq({ acquirer: "mercadopago" }, scope), degraded as never)
    expect(degraded.body).toEqual({ status: "degraded" })
    expect(mod.db.audits.map((a) => a.event)).toContain("connection.degraded")
  })

  it("select com corpo inválido; registers POST sem label; registersOf vazio", async () => {
    const invalid = fakeRes()
    await selectRoute(fakeReq({ id: "t1" }, scope, { body: { registerId: "não-uuid" } }), invalid as never)
    expect(invalid.code).toBe(400)
    const reg = fakeRes()
    await registersPost(fakeReq({}, scope, { body: { registerId: "11111111-1111-4111-8111-111111111111" } }), reg as never)
    expect(reg.code).toBe(200)
    expect(registersOf(undefined)).toEqual({})
    const listed = fakeRes()
    await registersGet(fakeReq({}, scope), listed as never)
    expect(listed.code).toBe(200)
  })

  it("sendOnboardingError mapeia tipado vs 502; merchantCredentials fail-closed", async () => {
    const res = fakeRes()
    sendOnboardingError(res as never, new OnboardingError("invalid_credential", 400, "x"))
    expect(res.code).toBe(400)
    const res2 = fakeRes()
    sendOnboardingError(res2 as never, new Error("cru"))
    expect(res2.code).toBe(502)
    await expect(merchantCredentials({ module: mod.svc as never, cfg: {} as never, http: {} as never, actorId: null })).rejects.toMatchObject({
      code: "not_connected",
    })
  })

  it("refresh: conexão desconectada → not_connected; sem refresh_token → reauthorize", async () => {
    await connectValidated(mod.svc as never, {
      acquirer: "mercadopago",
      secret: { access_token: "t", expires_at: new Date(Date.now() - 1000).toISOString() },
      actorId: null,
      from: "unconfigured",
      validate: async () => ({ user_id: "5" }),
    })
    const deps = {
      module: mod.svc,
      acquirer: "mercadopago",
      refresh: async () => ({ access_token: "n" }),
    }
    await expect(getValidAccessToken(deps as never, { forceRefresh: true })).rejects.toMatchObject({
      code: "reauthorize",
    })
    const { fetchImpl } = fakeFetch(() => ({ body: {} }))
    original = globalThis.fetch
    globalThis.fetch = fetchImpl
    await expect(
      getValidAccessToken({
        module: mod.svc as never,
        acquirer: "fantasma",
        refresh: async () => ({ access_token: "x" }),
      })
    ).rejects.toMatchObject({ code: "not_connected" })
  })

  it("connections GET lista conexões existentes; callback: adquirente estranho → error", async () => {
    mod.db.connections.push({ acquirer: "mercadopago", status: "connected", actionReason: null, externalRefs: {}, expiresAt: null, lastValidatedAt: null })
    const listed = fakeRes()
    await listRoute(fakeReq({}, scope), listed as never)
    expect((listed.body as { connections: unknown[] }).connections).toHaveLength(1)
    const res = fakeRes()
    await callbackGet(fakeReq({ acquirer: "sumup" }, scope, { query: {} }), res as never)
    expect(res.redirected?.location).toContain("result=error")
  })
})
