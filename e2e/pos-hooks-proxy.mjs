// Proxy mínimo: expoe APENAS /hooks/payment/* para o Medusa local (:9000).
// Qualquer outro caminho responde 404 — o funnel publico nunca ve o resto.
// L3 2026-10-05: o core 2.19 monta `pp_${param}` no getWebhookActionAndData
// (dist payment-module.js:697); o painel MP tem a URL COM pp_ — o proxy
// normaliza o segmento para o formato que o core 2.19 resolve (sem pp_).
import http from "node:http"
import { appendFileSync } from "node:fs"

const UPSTREAM = "http://127.0.0.1:9000"
const PORT = 8443

http.createServer((req, res) => {
  if (!req.url.startsWith("/hooks/payment/")) {
    res.writeHead(404, {"content-type": "application/json"})
    res.end(JSON.stringify({ error: "not_found" }))
    return
  }
  const rest = req.url.slice("/hooks/payment/".length)
  const provider = rest.split("?")[0].replace(/^pp_/, "")
  const query = rest.includes("?") ? "?" + rest.split("?").slice(1).join("?") : ""
  const upstreamUrl = "/hooks/payment/" + provider + query
  // Telemetria de entrega (L3): path como chega, presença dos headers de
  // assinatura e retry counter — sem valores de secret.
  try {
    appendFileSync("/tmp/proxy-hits.log", JSON.stringify({
      t: new Date().toISOString(),
      path: req.url,
      rid: !!req.headers["x-request-id"],
      sig: !!req.headers["x-signature"],
      retry: req.headers["x-retry"] ?? "-",
    }) + "\n")
  } catch {}
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", () => {
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    // Diagnóstico L3: corpo da entrega real (o MP aparenta mandar o id só na
    // query — confirmar com o dump antes de mudar contrato no plugin).
    try {
      appendFileSync("/tmp/proxy-bodies.log", JSON.stringify({
        t: new Date().toISOString(),
        bodyLen: body ? body.length : 0,
        body: body ? body.toString("utf8").slice(0, 600) : "",
        rid: req.headers["x-request-id"],
        sig: req.headers["x-signature"],
      }) + "\n")
    } catch {}
    const up = http.request(
      UPSTREAM + upstreamUrl,
      { method: req.method, headers: { ...req.headers, host: "127.0.0.1:9000" } },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers)
        ur.pipe(res)
      }
    )
    up.on("error", () => {
      res.writeHead(502, {"content-type": "application/json"})
      res.end(JSON.stringify({ error: "backend_unavailable" }))
    })
    if (body) up.write(body)
    up.end()
  })
}).listen(PORT, "127.0.0.1", () => console.log("pos hooks proxy on " + PORT))
