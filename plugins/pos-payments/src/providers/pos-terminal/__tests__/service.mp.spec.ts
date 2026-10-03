import { describe, expect, it, vi } from "vitest"
import type {
  ChargeStatusView,
  PosPaymentsAdapter,
} from "../../../adapters/types"
import type { Logger } from "@medusajs/framework/types"
import { POLL_WINDOW, mpPoll } from "../mp-status"
import { mpCancel, mpCapture, mpRefund } from "../service-mp-ops"
import PosTerminalProviderService from "../service"

// Logger parcial: o service só usa info/warn no caminho MP.
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger

const fakeAdapter = (
  get: PosPaymentsAdapter["getCharge"]
): PosPaymentsAdapter => ({
  acquirer: "mercadopago",
  createCharge: vi.fn(async () => ({
    chargeId: "ORD-1",
    view: { state: "pending", rawStatus: "created" } as ChargeStatusView,
  })),
  getCharge: vi.fn(get),
  cancelCharge: vi.fn(
    async () =>
      ({ state: "canceled", rawStatus: "canceled" }) as ChargeStatusView
  ),
  refundCharge: vi.fn(
    async () =>
      ({ state: "refunded", rawStatus: "refunded" }) as ChargeStatusView
  ),
})

describe("provider mercadopago (wiring T3)", () => {
  it("initiate persista charge_id/acquirer/state/data_version/amount_minor", async () => {
    const order = { id: "ORD-9", status: "created", type: "point" }
    const fetchImpl = (async (url: string | URL) =>
      new Response(JSON.stringify(order), { status: 201 })) as typeof fetch
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "mercadopago", accessToken: "test-token-fixture", fetchImpl }
    )
    const out = await service.initiatePayment({
      id: "pay_01H",
      amount: 19.99,
      currency_code: "brl",
      context: {},
      data: { terminal_id: "NEWLAND_N950__S1" },
    } as never)
    expect(out.id).toBe("ORD-9")
    expect(out.data).toMatchObject({
      charge_id: "ORD-9",
      acquirer: "mercadopago",
      state: "pending",
      data_version: 1,
      amount_minor: 1999,
      idempotency_key: "pos-terminal:pay_01H:charge",
    })
  })

  it("initiate sem terminal_id falha alta", async () => {
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "mercadopago", accessToken: "test-token-fixture" }
    )
    await expect(
      service.initiatePayment({
        id: "pay_01",
        amount: 10,
        context: {},
        data: {},
      } as never)
    ).rejects.toThrow(/terminal_id/)
  })
})

describe("poll do provider mercadopago (janelas 10s/40s)", () => {
  it("POLL_WINDOW é contrato do plugin", async () => {
    expect(POLL_WINDOW).toEqual({ typicalSeconds: 10, maxSeconds: 40 })
  })

  it("poll mapea os 8 estados sem lançar e sem timeout como falha", async () => {
    const estados = [
      ["created", "pending"],
      ["at_terminal", "pending_authorization"],
      ["action_required", "pending_authorization"],
      ["processed", "authorized"],
      ["failed", "error"],
      ["expired", "canceled"],
      ["canceled", "canceled"],
      ["refunded", "captured"],
    ] as const
    const chargeState: Record<string, string> = {
      created: "pending",
      at_terminal: "awaiting_terminal",
      action_required: "action_required",
      processed: "paid",
      failed: "failed",
      expired: "expired",
      canceled: "canceled",
      refunded: "refunded",
    }
    for (const [raw, esperado] of estados) {
      const out = await mpPoll(
        fakeAdapter(
          async () =>
            ({ state: chargeState[raw]!, rawStatus: raw }) as ChargeStatusView
        ),
        { charge_id: "ORD-1", state: "pending" },
        logger as never
      )
      expect(out.status).toBe(esperado)
    }
  })

  it("erro do poll degrada pending (não desiste na janela de 40s)", async () => {
    const out = await mpPoll(
      fakeAdapter(async () => {
        throw new Error("boom")
      }),
      { charge_id: "ORD-1", state: "awaiting_terminal" },
      logger as never
    )
    expect(out.status).toBe("pending")
  })
})

describe("reconvergência e resiliência do poll", () => {
  it("reconvergência fora da máquina: MP é a fonte de verdade e loga warn", async () => {
    const spy = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const out = await mpPoll(
      fakeAdapter(
        async () =>
          ({ state: "refunded", rawStatus: "refunded" }) as ChargeStatusView
      ),
      { charge_id: "ORD-1", state: "failed" },
      spy as never
    )
    expect(out.data?.state).toBe("refunded")
    expect(spy.warn).toHaveBeenCalled()
  })

  it("getPaymentStatus via service: erro degrada pending e nunca lança", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 500 })) as typeof fetch
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "mercadopago", accessToken: "test-token-fixture", fetchImpl }
    )
    const out = await service.getPaymentStatus({
      data: { charge_id: "ORD-1", state: "paid" },
    } as never)
    expect(out.status).toBe("pending")
  })

  it("initiate sem id de sessão falha alto (idempotência determinística)", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 201 })) as typeof fetch
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "mercadopago", accessToken: "test-token-fixture", fetchImpl }
    )
    await expect(
      service.initiatePayment({
        amount: 10,
        context: {},
        data: { terminal_id: "T1" },
      } as never)
    ).rejects.toThrow(/idempotência/)
  })

  it("poll sem state no blob assume pending antes da transição", async () => {
    const out = await mpPoll(
      fakeAdapter(
        async () =>
          ({ state: "paid", rawStatus: "processed" }) as ChargeStatusView
      ),
      { charge_id: "ORD-1" },
      logger as never
    )
    expect(out.status).toBe("authorized")
    expect(out.data?.state).toBe("paid")
  })
})

describe("captura e cancelamento via adapter", () => {
  it("capture é confirmação local: exige paid e é idempotente", async () => {
    const base = { charge_id: "ORD-1", state: "paid", amount_minor: 1999 }
    const ok = await mpCapture(
      fakeAdapter(
        async () =>
          ({ state: "paid", rawStatus: "processed" }) as ChargeStatusView
      ),
      { ...base },
      logger as never
    )
    expect(ok.data.captured_at).toBeTruthy()
    const repetida = await mpCapture(
      fakeAdapter(
        async () =>
          ({ state: "paid", rawStatus: "processed" }) as ChargeStatusView
      ),
      ok.data,
      logger as never
    )
    expect(repetida.data.captured_at).toBe(ok.data.captured_at)
  })

  it("capture sem pagamento creditado falha alto (UNEXPECTED_STATE)", async () => {
    await expect(
      mpCapture(
        fakeAdapter(
          async () =>
            ({
              state: "awaiting_terminal",
              rawStatus: "at_terminal",
            }) as ChargeStatusView
        ),
        { charge_id: "ORD-1", state: "awaiting_terminal" },
        logger as never
      )
    ).rejects.toThrow(/creditado/)
  })

  it("cancel via adapter grava a transição; capturada recusa", async () => {
    const ok = await mpCancel(
      fakeAdapter(
        async () =>
          ({ state: "canceled", rawStatus: "canceled" }) as ChargeStatusView
      ),
      { charge_id: "ORD-1", state: "awaiting_terminal" },
      logger as never
    )
    expect(ok.data.state).toBe("canceled")
    await expect(
      mpCancel(
        fakeAdapter(
          async () =>
            ({ state: "canceled", rawStatus: "canceled" }) as ChargeStatusView
        ),
        {
          charge_id: "ORD-1",
          state: "canceled",
          captured_at: "2026-10-03T00:00:00Z",
        },
        logger as never
      )
    ).rejects.toThrow(/refund/)
  })
})

describe("refund do provider mercadopago", () => {
  it("refund manual sem amount grava refunded_at sem last_refunded_amount", async () => {
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "manual" }
    )
    const out = await service.refundPayment({
      data: { authorized_at: "x" },
    } as never)
    expect(out.data?.refunded_at).toBeTruthy()
    expect(out.data?.last_refunded_amount).toBeUndefined()
  })

  it("ciclo via service: capture/cancel/refund delegam ao adapter", async () => {
    const respostas = [
      new Response(
        JSON.stringify({ id: "ORD-9", status: "processed", type: "point" })
      ),
      new Response(
        JSON.stringify({ id: "ORD-9", status: "canceled", type: "point" })
      ),
      new Response(
        JSON.stringify({ id: "ORD-9", status: "refunded", type: "point" }),
        { status: 201 }
      ),
    ]
    const fetchImpl = (async () =>
      respostas.shift() ?? new Response("{}", { status: 500 })) as typeof fetch
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "mercadopago", accessToken: "test-token-fixture", fetchImpl }
    )
    const cap = await service.capturePayment({
      id: "x",
      data: { charge_id: "ORD-9", state: "paid", amount_minor: 1999 },
    } as never)
    expect(cap.data?.captured_at).toBeTruthy()
    const can = await service.cancelPayment({
      id: "x",
      data: { charge_id: "ORD-9", state: "awaiting_terminal" },
    } as never)
    expect(can.data?.state).toBe("canceled")
    const ref = await service.refundPayment({
      id: "x",
      amount: 1999,
      data: { charge_id: "ORD-9", state: "paid", amount_minor: 1999 },
    } as never)
    expect(ref.data?.state).toBe("refunded")
  })

  it("getPaymentStatus sem data degrada pending (ramo do coalescing)", async () => {
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "manual" }
    )
    const out = await service.getPaymentStatus({} as never)
    expect(out.status).toBe("pending")
  })

  it("getPaymentStatus manual com data hostil degrada pending (catch legado)", async () => {
    const service = new PosTerminalProviderService(
      { logger },
      { acquirer: "manual" }
    )
    const hostil = {
      get captured_at(): string {
        throw new Error("getter hostil")
      },
    }
    const out = await service.getPaymentStatus({ data: hostil } as never)
    expect(out.status).toBe("pending")
  })
})

describe("refund do provider mercadopago", () => {
  it("refund parcial é recusado ANTES da adquirente (Point só total)", async () => {
    await expect(
      mpRefund(
        fakeAdapter(
          async () =>
            ({ state: "paid", rawStatus: "processed" }) as ChargeStatusView
        ),
        { charge_id: "ORD-1", state: "paid", amount_minor: 1999 },
        "10.00",
        logger as never
      )
    ).rejects.toThrow(/parcial/)
  })
})
