/* L3 — Webhook E2E no sandbox: entrega REAL do MP pela rota nativa do core.
 * Fluxo: login admin → draft order → collection → session (com terminal_id no
 * data; initiate cria a charge) → replay pela rota admin (mesma ordem via
 * idempotência) → simulate processed → assert de captura no DB (MP →
 * funnel → proxy stripa pp_ → rota 200 → event bus → provider HMAC + re-fetch
 * → ação captured → captured_at no payment) → simulate refunded → assert
 * Refund no core (subscriber) →
 * dedup (redelivery assinada ×2) → negativo (sem assinatura). Asserts de
 * estado via psql no container (API admin 2.19 não expõe retrieve da
 * collection). Token e secret nunca logados. */
const fs = require("fs")
const { execFileSync } = require("node:child_process")
const { createHmac, randomUUID } = require("node:crypto")

const BACKEND = "http://127.0.0.1:9000"
const HOOK = "http://127.0.0.1:8443/hooks/payment/pp_pos-terminal_mercadopago"
const TERMINAL = "NEWLAND_N950__SBX0000001"
const PROVIDER = "pp_pos-terminal_mercadopago"

const ENV_PATH = process.env.BACKEND_ENV_FILE
if (!ENV_PATH) {
  console.error(
    "FAIL env: BACKEND_ENV_FILE ausente (caminho do .env do backend)"
  )
  process.exit(1)
}
const env = {}
for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const MP_TOKEN = env.MP_ACCESS_TOKEN
const MP_SECRET = env.MP_WEBHOOK_SECRET
const DB = (env.DATABASE_URL || "").split("?")[0].split("/").pop()
if (
  !MP_TOKEN ||
  !MP_SECRET ||
  !DB ||
  !env.MEDUSA_ADMIN_EMAIL ||
  !env.MEDUSA_ADMIN_PASSWORD
) {
  console.error(
    "FAIL env: credenciais/DATABASE_URL ausentes no .env do backend"
  )
  process.exit(1)
}

const results = []
const log = (step, ok, detail) => {
  results.push({ step, ok })
  console.log(
    (ok ? "PASS" : "FAIL") + " " + step + (detail ? " :: " + detail : "")
  )
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function dbVal(sql, sid) {
  // Consulta via STDIN com psql -v: a substituicao de :'"'"'sid'"'"' so acontece no
  // buffer de consulta (stdin), nao no -c do psql do container.
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "pos-postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      DB,
      "-At",
      "-v",
      "sid=" + sid,
    ],
    { input: sql }
  )
    .toString()
    .trim()
}

async function api(method, path, token, body) {
  const r = await fetch(BACKEND + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* html/empty */
  }
  return { status: r.status, json, text }
}

async function simulate(orderId, status) {
  const r = await fetch(
    "https://api.mercadopago.com/v1/orders/" + orderId + "/events",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + MP_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status }),
    }
  )
  return r.status
}

function signEnvelope(envelope) {
  const ts = String(Date.now())
  const rid = randomUUID()
  // Fórmula oficial: data.id em lowercase no canonical (notifications MP).
  const canonical = `id:${String(
    envelope.data.id
  ).toLowerCase()};request-id:${rid};ts:${ts};`
  const v1 = createHmac("sha256", MP_SECRET).update(canonical).digest("hex")
  return {
    headers: {
      "content-type": "application/json",
      "x-request-id": rid,
      "x-signature": `ts=${ts},v1=${v1}`,
    },
    body: JSON.stringify(envelope),
  }
}

async function postHook(headers, body) {
  const r = await fetch(HOOK, { method: "POST", headers, body }) // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request - loopback 127.0.0.1 do harness local
  return r.status
}

async function main() {
  // 0) login admin
  const auth = await api("POST", "/auth/user/emailpass", null, {
    email: env.MEDUSA_ADMIN_EMAIL,
    password: env.MEDUSA_ADMIN_PASSWORD,
  })
  const token = auth.json && auth.json.token
  log("admin.login", !!token, token ? "jwt ok" : "http=" + auth.status)
  if (!token) process.exit(1)

  // 1) draft order → collection → session (initiate cria a charge na adquirente)
  const regs = await api("GET", "/admin/regions", token)
  const regionId =
    regs.json &&
    regs.json.regions &&
    regs.json.regions[0] &&
    regs.json.regions[0].id
  log("region.list", !!regionId, regionId || "http=" + regs.status)
  const draft = await api("POST", "/admin/draft-orders", token, {
    region_id: regionId,
    email: "l3-e2e@voolulabs.test",
  })
  const orderId =
    draft.json && draft.json.draft_order && draft.json.draft_order.id
  log("draftorder.create", !!orderId, orderId || "http=" + draft.status)
  const col = await api("POST", "/admin/payment-collections", token, {
    order_id: orderId,
    amount: 1000,
  })
  const colId =
    col.json && col.json.payment_collection && col.json.payment_collection.id
  log("collection.create", !!colId, colId || "http=" + col.status)
  let sessFull = null
  let sessErr = "sem tentativa"
  for (let tent = 1; tent <= 10 && !sessFull; tent++) {
    const sess = await api(
      "POST",
      "/admin/payment-collections/" + colId + "/payment-sessions",
      token,
      {
        provider_id: PROVIDER,
        data: { terminal_id: TERMINAL },
      }
    )
    sessFull =
      sess.json &&
      sess.json.payment_collection &&
      sess.json.payment_collection.payment_sessions &&
      sess.json.payment_collection.payment_sessions[0]
    if (!sessFull) {
      sessErr = "http=" + sess.status + " (tentativa " + tent + "/5)"
      console.log(
        "INFO session.retry :: " +
          sessErr +
          " — fila do simulador compartilhado; aguardando 60s"
      )
      await sleep(60000)
    }
  }
  const sessId = sessFull && sessFull.id
  const chargeNaSessao = sessFull && sessFull.data && sessFull.data.charge_id
  log(
    "session.create",
    !!sessId && !!chargeNaSessao,
    sessId
      ? "session=" + sessId + " charge_no_initiate=" + (chargeNaSessao || "-")
      : sessErr
  )
  if (!sessId || !chargeNaSessao) process.exit(1)

  // 2) replay pela rota admin — MESMA chave de idempotência (seed = session id):
  // devolve a MESMA ordem. amountMinor em MINOR units verbatim (R$10,00 = 1000),
  // igual ao amount da collection — semântica única com o initiate (W1.1).
  const charge = await api("POST", "/admin/pos-payments/charges", token, {
    amountMinor: 1000,
    externalReference: sessId,
    terminalId: TERMINAL,
  })
  log(
    "charge.replay.mesma-ordem",
    !!charge.json && charge.json.chargeId === chargeNaSessao,
    "route=" +
      ((charge.json && charge.json.chargeId) || "-") +
      " http=" +
      charge.status
  )

  // 3) simulate processed → webhook REAL → captura no core (assert via DB).
  // O valor capturado vive no PAYMENT (captured_at), não na sessão: o core
  // 2.19 reescreve CAPTURED → AUTHORIZED em authorizePaymentSession_
  // (payment-module.ts:645, tag v2.19.0) e a captura do autocapture
  // (processPaymentWorkflow) grava captured_at no payment sem tocar a sessão.
  const s1 = await simulate(chargeNaSessao, "processed")
  log("simulate.processed", s1 === 204, "http=" + s1)
  let capturou = false
  for (let i = 0; i < 17; i++) {
    await sleep(3000)
    const st = dbVal(
      "select case when p.captured_at is not null then 'captured' else s.status end from payment_session s left join payment p on p.payment_session_id = s.id where s.id = :'sid'",
      sessId
    )
    if (st === "captured") {
      capturou = true
      log(
        "webhook.captured",
        true,
        "captura confirmada (payment.captured_at, t+" + (i + 1) * 3 + "s)"
      )
      break
    }
    if (i === 16) log("webhook.captured", false, "timeout; status=" + st)
  }

  // 4) simulate refunded → subscriber cria o Refund no core (assert via DB)
  const s2 = await simulate(chargeNaSessao, "refunded")
  log("simulate.refunded", s2 === 204, "http=" + s2)
  const sqlRefunds =
    "select count(*) from refund r join payment p on r.payment_id=p.id where p.payment_session_id = :'sid'"
  let refunds = 0
  for (let i = 0; i < 17; i++) {
    await sleep(3000)
    refunds = Number(dbVal(sqlRefunds, sessId) || 0)
    if (refunds > 0) {
      log(
        "webhook.refunded",
        true,
        "refunds=" + refunds + " (t+" + (i + 1) * 3 + "s)"
      )
      break
    }
    if (i === 16) log("webhook.refunded", false, "timeout sem refund")
  }

  // 5) dedup: redelivery ASSINADA do mesmo evento ×2 — refund não duplica
  const envelope = {
    action: "order.refunded",
    api_version: "v1",
    data: { id: chargeNaSessao },
    date_created: new Date().toISOString(),
    id: "manual-dedup-" + Date.now(),
    live_mode: false,
    type: "order",
    user_id: 0,
  }
  const assinada = signEnvelope(envelope)
  const d1 = await postHook(assinada.headers, assinada.body)
  const d2 = await postHook(assinada.headers, assinada.body)
  log("dedup.http200", d1 === 200 && d2 === 200, "http=" + d1 + "/" + d2)
  await sleep(12000)
  const depois = Number(dbVal(sqlRefunds, sessId) || 0)
  log(
    "dedup.sem-duplicacao",
    depois === refunds,
    "refunds antes=" + refunds + " depois=" + depois
  )

  // 6) negativo: entrega SEM assinatura → 200 ao MP, estado inalterado
  const semSig = await postHook(
    { "content-type": "application/json" },
    JSON.stringify(envelope)
  )
  await sleep(9000)
  const fin = Number(dbVal(sqlRefunds, sessId) || 0)
  log(
    "negativo.sem-assinatura",
    semSig === 200 && fin === depois,
    "http=" + semSig + " refunds=" + fin
  )

  const pass = results.filter((r) => r.ok).length
  console.log("RESUMO: " + pass + "/" + results.length + " PASS")
  process.exit(pass === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error(
    "FAIL excecao :: " + String(e && e.message ? e.message : e).slice(0, 300)
  )
  process.exit(1)
})
