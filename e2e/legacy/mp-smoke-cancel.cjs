/* Fumaça complementar: cancelamento em `created` (ok) e em `processed` (recusado). */
const BASE =
  "/home/chicofwd/ekipo/voolulabs/medusa-plugin-pos-payments/plugins/pos-payments/.medusa/server/src/adapters/mercadopago"
const { MercadoPagoAdapter } = require(BASE + "/adapter.js")

const token = process.env.MP_ACCESS_TOKEN
const adapter = new MercadoPagoAdapter({ accessToken: token })
const results = []
const log = (step, ok, detail) => {
  results.push(ok)
  console.log(
    (ok ? "PASS" : "FAIL") + " " + step + (detail ? " :: " + detail : "")
  )
}

async function main() {
  const ref = "smokec" + Date.now()
  const criada = await adapter.createCharge(
    {
      amountMinor: 500,
      externalReference: ref,
      terminalId: "NEWLAND_N950__SBX0000001",
      expirationTime: "PT15M",
    },
    "pos-payments-mercadopago:" + ref + ":charge"
  )
  log(
    "criar.created",
    criada.view.rawStatus === "created",
    `charge=${criada.chargeId}`
  )

  const cancelada = await adapter.cancelCharge(
    criada.chargeId,
    "pos-payments-mercadopago:" + ref + ":cancel",
    { allowAtTerminal: true }
  )
  log(
    "cancel.em.created",
    cancelada.state === "canceled",
    `raw=${cancelada.rawStatus} state=${cancelada.state}`
  )

  // ordem nova -> simula processed -> cancelar deve ser recusado pela MP
  const ref2 = ref + "x"
  const segunda = await adapter.createCharge(
    {
      amountMinor: 700,
      externalReference: ref2,
      terminalId: "NEWLAND_N950__SBX0000001",
      expirationTime: "PT15M",
    },
    "pos-payments-mercadopago:" + ref2 + ":charge"
  )
  await fetch(
    "https://api.mercadopago.com/v1/orders/" + segunda.chargeId + "/events",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "processed" }),
    }
  )
  await new Promise((r) => setTimeout(r, 6000))
  let recusou = null
  try {
    await adapter.cancelCharge(
      segunda.chargeId,
      "pos-payments-mercadopago:" + ref2 + ":cancel",
      { allowAtTerminal: true }
    )
  } catch (e) {
    recusou = String(e.message || e).slice(0, 120)
  }
  log(
    "cancel.em.processed.recusado",
    !!recusou,
    recusou ?? "adquirente ACEITOU (inesperado)"
  )

  const pass = results.filter(Boolean).length
  console.log(`RESUMO: ${pass}/${results.length} PASS`)
  process.exit(pass === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error("FAIL excecao :: " + String(e).slice(0, 300))
  process.exit(1)
})
