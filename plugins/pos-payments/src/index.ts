import type { PosPaymentsPluginOptions } from "./types"
import { PLUGIN_NAME } from "./utils/plugin-options"

export default function PosPaymentsPlugin(options: PosPaymentsPluginOptions = {}) {
  return {
    resolve: PLUGIN_NAME,
    options: options as Record<string, unknown>,
  }
}

export type { PosPaymentsPluginOptions }
