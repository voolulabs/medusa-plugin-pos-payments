import { Modules } from "@medusajs/framework/utils"
import { ModuleProvider } from "@medusajs/framework/utils"
import PosTerminalProviderService from "./service"

// §6.2: o provider entra no modulo payment via ModuleProvider - o index e o
// ponto de carga do resolve "@voolulabs/medusajs-plugin-pos-payments/providers/pos-terminal".
export default ModuleProvider(Modules.PAYMENT, {
  services: [PosTerminalProviderService],
})
