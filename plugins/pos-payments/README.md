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

- [Medusa v2 backend](https://docs.medusajs.com) — `@medusajs/framework` >= 2.15
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
