# Spec: Fase 2 — T4 rotas admin de charges e terminais (§6.3) sobre o adapter

Extraída para o gate P1 do ADLC (ticket `T4`). Fontes: §6.3 do plano (contrato genérico de
rotas), ADR 0005 (superfícies API autenticadas), §7 do mercado-pago.md (mapa rota→endpoint),
CONSTRAINTS 1/4 (minor units; falhar alto), política de adapters (ADR 0001) e o error-handler
do framework 2.19 (mapeamento MedusaError→HTTP, verificado no dist instalado). Base: cliente
HTTP (T1), taxonomia de status (T2) e adapter/wiring (T3) já mergeados.

## 1. Escopo do ticket

- `src/api/admin/pos-payments/charges/route.ts` — `POST`: cria a cobrança na adquirente.
- `src/api/admin/pos-payments/charges/[id]/route.ts` — `GET`: estado autoritativo (poll do POS).
- `src/api/admin/pos-payments/charges/[id]/cancel/route.ts` — `POST`: cancela na adquirente.
- `src/api/admin/pos-payments/terminals/route.ts` — `GET`: lista terminais ativos.
- `src/api/admin/pos-payments/adapter-scope.ts` — resolução do adapter por request.
- `src/api/admin/pos-payments/errors.ts` — mapeamento erro do adapter → `MedusaError`.
- `src/api/admin/pos-payments/schemas.ts` — zod de body/query/param (fronteira da rota).
- `src/adapters/types.ts` — `listTerminals` entra na interface (aditivo) + tipos de domínio.
- `src/adapters/mercadopago/` — `MpAdapter.listTerminals` + mapeamento para o domínio.
- `src/types/index.ts` — bloco `posTerminal` nas options do plugin.

Fora de escopo: rota de refund (reflui pelo `refundPayment` do core), rota de simulação
(§4.5 fica para a homologação), provisionamento/select/status de terminal (2b), webhook (T5).

## 2. Resolução do adapter (decisão de desenho)

Os providers do módulo payment não são resolvíveis do container (verificado no
`@medusajs/payment` 2.19: instâncias internas ao módulo, sem método público de acesso). As
rotas então leem o bloco `posTerminal: { acquirer, accessToken }` das **options do plugin**
(array `plugins` do config module — via `getPluginOptions`, padrão ADR 0002 §5) e resolvem o
adapter por request (stateless sobre o cliente T1; nunca credencial em log). `manual` ou
bloco ausente → `NOT_ALLOWED` (400); `mercadopago` sem `accessToken` → falha alta. O bloco
espelha as options do provider no `medusa-config` (a spec do T6 unifica via env).

## 3. Contrato das rotas

- Auth do core em `/admin/*` — padrão da rota `health`; este plugin não tem `middlewares.ts`.
- Dinheiro em **minor units**: `amount_minor` inteiro > 0 no body (fronteira única — adapter
  converte para a forma da adquirente). `external_reference` obrigatória (1–64
  `[A-Za-z0-9-_]`; deve ser o id da payment session — reconciliação). `terminal_id`
  obrigatório. `expiration_time` (ISO-8601 PT30S–PT3H), `description` e
  `payment_method_default_type` opcionais.
- **Idempotência determinística compartilhada com o provider**: chave
  `pos-payments-mercadopago:<external_reference>:charge` (mesma derivação do `mpInitiate`).
  Replay do mesmo corpo devolve a MESMA ordem (dedup da MP + reuse-guard de valor e terminal
  do T3); corpo divergente falha alto (`UNEXPECTED_STATE`, mensagem nomeia a divergência).
- Cancel com header `X-Allow-Cancelable-Status` **incondicional** (decisão do T3: a MP carrega
  a ordem no terminal em segundos; o cancel de `created` pré-carga exigiria estado local que a
  rota não tem).
- `GET /terminals`: query `limit` (1–50), `offset` (≥0), `store_id`/`pos_id` (numéricos)
  validada na fronteira (zod) e no client (`assertTerminalsQuery`). Resposta **agnóstica de
  adquirente**: `{ terminals: [{ id, store_id, pos_id, external_pos_id, operating_mode }],
  paging: { total, offset, limit } }` — mapeamento snake_case→domínio no adapter.
- Respostas de charge: `{ charge_id, state, raw_status, payment_id?, reason_code?,
  retry_class?, reason? }` (view do T2 + `charge_id`).

## 4. Mapeamento de erros (verificado no error-handler do framework 2.19)

| Origem | Resposta |
|---|---|
| body/query/param fora do schema (zod) | `INVALID_DATA` → 400, mensagens das issues |
| `manual`/bloco `posTerminal` ausente | `NOT_ALLOWED` → 400 |
| `MpApiError` com status 404 da adquirente | `NOT_FOUND` → 404 |
| demais falhas do adapter (`MpApiError` ≠ 404, `MpContractError`) | `UNEXPECTED_STATE` → 500, mensagem preservada |

## Acceptance criteria (cada uma com verify)

1. MUST `POST /charges` valida fail-closed e cria a cobrança (`charge_id` + view) —
   verify: `pnpm exec vitest run` (spec das rotas com fetch fake injetado).
2. MUST idempotência determinística: replay do mesmo corpo devolve a mesma ordem sem segunda
   criação divergente — verify: spec das rotas.
3. MUST `GET /charges/:id` devolve o estado autoritativo (view com `raw_status`) — verify:
   spec das rotas.
4. MUST cancel chama a adquirente com header incondicional e devolve a view — verify: spec
   das rotas (registro da chamada).
5. MUST `GET /terminals` valida a query e devolve `{terminals, paging}` agnóstico — verify:
   spec das rotas.
6. MUST mapeamento de erros 400/404/500 conforme a tabela da spec — verify: spec de erros
   das rotas.
7. MUST arquivos ≤100 linhas — verify: `opcore check --repo . --all`.
8. MUST lint/format/typecheck/knip verdes — verify: bateria local + steps do CI.
9. MUST cobertura global ≥90% e money paths ≥95% — verify: `pnpm test:coverage`.
10. SHOULD nenhuma dependência nova (zod via `@medusajs/framework/zod`, peer dep) — verify:
    diff do package.json contra a base.
