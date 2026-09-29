import type { PosPaymentsPluginOptions } from "./types"

export default function PosPaymentsPlugin(options: PosPaymentsPluginOptions = {}) {
  return {
    resolve: "@voolulabs/medusajs-plugin-pos-payments",
    options: options as Record<string, unknown>,
  }
}

export type { PosPaymentsPluginOptions }
