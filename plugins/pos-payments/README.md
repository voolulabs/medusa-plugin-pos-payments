# Medusa POS Payments

[![Codecov](https://codecov.io/github/voolulabs/medusajs-plugin-pos-payments/graph/badge.svg)](https://codecov.io/github/voolulabs/medusajs-plugin-pos-payments)

_In-person Brazilian card-terminal (maquininha) payments for Medusa v2._

`@voolulabs/medusajs-plugin-pos-payments` adds a `pos-terminal` payment provider family to Medusa so a point-of-sale front end can take BRL payments made on physical card terminals (cash, card, Pix, bank transfer). Phase 1 ships the manual / terminal-present flow: the cashier confirms the charge made on the terminal, and the backend records the payment state. Acquirer adapters (Mercado Pago Point, SumUp, Stone, Cielo) plug into the same provider in later phases.

[Documentation](https://github.com/voolulabs/medusajs-pos-payments/tree/main/docs) | [Medusa Website](https://www.medusajs.com) | [Medusa Repository](https://github.com/medusajs/medusa)

## Features

- `pos-terminal` payment provider registered as `pp_pos-terminal_card`, `pp_pos-terminal_pix`, `pp_pos-terminal_cash`, `pp_pos-terminal_transfer`
- Manual / terminal-present flow: no acquirer credentials required in Phase 1
- Authenticated health endpoint `GET /admin/pos-payments/health`
- Provider ids consumed verbatim by the POS app from `store.metadata.pos` — zero front-end changes
- State kept in Medusa payment `data`/`metadata` (JSONB) — no migrations, no extra tables
- Hardened session-data handling: zod validation at the boundary, prototype-pollution rejection

---

## Prerequisites

- [Medusa v2 backend](https://docs.medusajs.com) — `@medusajs/framework` >= 2.19
- Node.js >= 20

---

## How to Install

1. Run the following command in your Medusa backend project:

   ```bash
   npm install @voolulabs/medusajs-plugin-pos-payments
   ```

2. Enable the manual providers in your `.env`:

   ```bash
   POS_PAYMENTS_MANUAL=true
   ```

3. In `medusa-config.js`, register the plugin (routes) **and** the provider(s) (payment module):

   ```js
   // 1. routes — in the top-level `plugins` array:
   plugins: [
     // ...
     {
       resolve: "@voolulabs/medusajs-plugin-pos-payments",
       options: {},
     },
   ]

   // 2. provider — in `modules`, on the payment module:
   modules: [
     {
       resolve: "@medusajs/payment",
       options: {
         providers: [
           ...(process.env.POS_PAYMENTS_MANUAL === "true"
             ? ["card", "pix", "cash", "transfer"].map((method) => ({
                 resolve: "@voolulabs/medusajs-plugin-pos-payments/providers/pos-terminal",
                 id: method,
                 options: { acquirer: "manual" },
               }))
             : []),
         ],
       },
     },
   ]
   ```

4. Enable the `pp_pos-terminal_*` providers on the region your POS uses (e.g. in the seed or via the admin API).

---

## Webhooks and Reconciliation (mercadopago)

The provider registers a native webhook handler at `POST /hooks/payment/pos-terminal_mercadopago`.
Point your Mercado Pago application webhook at the **full URL** (application-level config in the
developer panel; the panel summary shows only the domain — configure the complete path).

The core Medusa payment module emits the webhook event on an internal queue with
`attempts: 3` and a `delay: 5000`ms by default. Mercado Pago retries its delivery for up to 22s
and only while it does NOT receive a 2xx — so if every internal attempt fails, a terminal-originated
refund could stay unreconciled. Two defenses, use both:

1. **Raise the internal budget** on the payment module (`webhook_retries` / `webhook_delay` are
   core options read from the payment module registration — verified in the `@medusajs/medusa`
   2.19 hook route):

   ```js
   modules: [
     {
       resolve: "@medusajs/payment",
       options: {
         webhook_retries: 6,   // default 3
         webhook_delay: 10000, // default 5000
         providers: [/* ... */],
       },
     },
   ]
   ```

2. **Scheduled reconciliation job** (registered automatically by this plugin, daily at 04:00):
   scans captured payments of `pp_pos-terminal_mercadopago` from the last 30 days (the charge
   state lives in `payment.data`, written by the provider's capture/refund), re-fetches each
   charge from the Mercado Pago Orders API and reconciles refunds that were missed by the event
   bus, reusing the same idempotent decision and transaction id as the webhook subscriber.
   The guard is the Medusa payment's refunds list; job×subscriber parallelism is serialized by
   the core's refund row lock (`FOR UPDATE` under a mandatory transaction, verified in
   `@medusajs/payment` 2.19.0) plus the refund idempotency key at the acquirer — engine-level
   mutual exclusion remains a T5 residual tracked in ADR 0007. Volume: one GET per captured
   payment within the window, sequential, per daily run.
   The job is presence-gated: without the `posTerminal.acquirer: "mercadopago"` block it does
   nothing.

The plugin also keeps both entries in your `medusa-config.js` honest: if the provider entry of the
payment module and the plugin's `posTerminal` block diverge (token/secret/test mode), the provider
fails to resolve with the diverging key NAMES (providers are constructed lazily — first session,
webhook or capture). Manual providers (`card`/`pix`/`cash`/`transfer`) are exempt, since they do
not consume the block.

---

## Cancellation contract (mercadopago)

`POST /admin/pos-payments/charges/:id/cancel` maps the Mercado Pago Orders API contract by
charge state (official .mx docs, 2026-10-07 — note that Mercado Pago's docs currently diverge
by region AND language; the .br pages are stale):

| Charge state at MP | HTTP | Body |
|---|---|---|
| `created` | **200** | `{chargeId, ...view}` with `state: "canceled"` (synchronous cancel) |
| `at_terminal` | **202** | `{chargeId, ...view}` with `state: "awaiting_terminal"` and `cancelRequested: true` — the cancellation is REQUESTED, not done: the order stays `at_terminal` until the webhook/poll confirms, and the terminal may prioritize the charge and capture anyway |
| `action_required` / `expired` / `processed` | **409** | `{code: "cannot_cancel_order", message, state}` — refusal body is a public contract of this plugin |
| already canceled | **200** | re-fetch confirms `state: "canceled"` (idempotent); a diverging re-fetch answers **409** with the real `state` (`state` is `"desconhecido"` when the re-fetch itself fails) |
| any other state echoed by a 2xx cancel | **202** | defensive: a successful cancel over `at_terminal` is async by contract — the body carries the state verbatim |

The `x-allow-cancelable-status: at_terminal` header is sent unconditionally (MP ignores it
for `created` and requires it for `at_terminal`). Poll responses carry `cancelRequested:
true` while the cancellation is in flight. Idempotency keys are canonical UUIDv5 under a
plugin-fixed namespace — deterministic, so retrying the same operation reuses the same key
(docs accept "UUID v4 or random string"): `<chargeId>:cancel` for cancel,
`<sessionReference>:charge` for create, `<chargeId>:refund:<amountMinor>` for refund.

---

## Test the Plugin

1. Run your Medusa backend (`pnpm dev` / `pnpm start`).
2. Log in and list the providers enabled on your POS region — on Medusa 2.19 the listing lives on the Store API:

   ```bash
   curl "http://<backend>:9000/store/payment-providers?region_id=<region>" \
     -H "x-publishable-api-key: pk_..."
   ```

   The `pp_pos-terminal_*` providers must be listed (the admin API does not expose this route on 2.19).
3. Place a test order with the provider `pp_pos-terminal_card` (draft order → payment collection → payment session → mark as paid) and confirm `payment_status` is `captured` with the provider id preserved.

---

## Additional Resources

- [Medusa Payment Provider Reference](https://docs.medusajs.com/resources/references/payment/provider)
- [Creating a Plugin](https://docs.medusajs.com/learn/fundamentals/plugins/create)
- Acquirer adapter roadmap and architecture decisions: `docs/adr/` in this repository
