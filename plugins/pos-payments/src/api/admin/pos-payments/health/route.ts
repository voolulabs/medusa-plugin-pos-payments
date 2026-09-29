import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework"

// §6.3/ADR 0005: rotas do plugin vivem sob /admin/pos-payments/* e usam a auth
// do core - SEM authenticate proprio (middlewares.ts nao existe neste plugin).
export const GET = (_req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.status(200).json({
    status: "ok",
    plugin: "@voolulabs/medusajs-plugin-pos-payments",
    mode: "manual (terminal-presente)",
  })
}
