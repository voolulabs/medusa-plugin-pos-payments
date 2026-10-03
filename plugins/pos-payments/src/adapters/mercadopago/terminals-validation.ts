/** Validações de terminal (listagem e setup) — contrato oficial da API de terminais. */
import { MpContractError } from "./types"
import { assertTerminalId } from "./validation"

/** Ids de store/pos da API são numéricos (ex. 47792476) — seriais não servem. */
const NUMERIC_ID = /^\d{1,20}$/
const OPERATING_MODES = new Set(["PDV", "STANDALONE"])

/** Consulta da listagem: limit 1–50 (teto da API), offset ≥ 0, ids numéricos. */
export function assertTerminalsQuery(query: {
  limit?: number
  offset?: number
  storeId?: string
  posId?: string
}): void {
  if (
    query.limit !== undefined &&
    (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50)
  ) {
    throw new MpContractError(
      `limit deve ser inteiro 1–50: recebido ${query.limit}`
    )
  }
  if (
    query.offset !== undefined &&
    (!Number.isInteger(query.offset) || query.offset < 0)
  ) {
    throw new MpContractError(
      `offset deve ser inteiro ≥ 0: recebido ${query.offset}`
    )
  }
  for (const [field, value] of [
    ["store_id", query.storeId],
    ["pos_id", query.posId],
  ] as const) {
    if (value !== undefined && !NUMERIC_ID.test(value)) {
      throw new MpContractError(
        `${field} deve ser id numérico: recebido "${value}"`
      )
    }
  }
}

/** Item do setup validado em runtime: id formal e modo conhecido (TS não cobre o valor). */
export function assertSetupItem(item: {
  id: string
  operatingMode: string
}): void {
  assertTerminalId(item.id)
  if (!OPERATING_MODES.has(item.operatingMode)) {
    throw new MpContractError(
      `operating_mode deve ser PDV ou STANDALONE: recebido "${item.operatingMode}"`
    )
  }
}
