# Spec: Fase 2 — T3 adapter na interface comum + wiring no provider + poll 10s/40s

Extraída para o gate P1 do ADLC (ticket `T3`). Fontes: contrato oficial Orders API (poll do
plugin), CONSTRAINTS 2/4/6 (máquina de transições com mutator único; falhar alto; data_version),
logs D1/D2 (logger estruturado com correlação; info=transição, warn=409 fila/4xx, error=5xx) e
política de adapters (ADR 0001). Base: cliente HTTP (T1) e taxonomia de status (T2) já mergeados.

## 1. Escopo do ticket

- `src/adapters/types.ts` — interface `PosPaymentsAdapter` (`acquirer`, `createCharge`,
  `getCharge`, `cancelCharge`, `refundCharge`); dinheiro em **minor units** no domínio.
- `src/adapters/mercadopago/adapter.ts` — implementa a interface sobre o cliente T1 +
  `mapOrderStatus` (T2) + `money.ts`; **idempotency key por parâmetro** (derivada e persistida
  pelo provider ANTES do envio).
- `src/adapters/index.ts` — `resolveAdapter(options)`: `manual` → sem adapter (comportamento
  atual intacto); `mercadopago` → MpAdapter; desconhecida → falha alta.
- `src/providers/pos-terminal/charge-state.ts` — `ALLOWED_TRANSITIONS` + mutator único
  `transition(from, to)` sobre o vocabulário `ChargeState` do T2; grava `state` +
  `data_version` no blob `data`.
- `src/providers/pos-terminal/service.ts` — wiring por `options.acquirer`.

Fora de escopo: rotas HTTP (T4), webhook/subscriber (T5), registro presence-gated por
credencial de ambiente (T6).

## Emendas do build (rodada de implementação)

- **Estorno do Point é TOTAL** (contrato oficial, sem body/amount): `refundCharge` da interface
  não recebe amount; reembolso PARCIAL é recusado pelo provider ANTES de chamar a adquirerente
  (`UNEXPECTED_STATE`) — sem estorno silencioso total.
- **`service.ts` (legado da Fase 1) fica acima de 100 linhas** com o wiring; o código MP novo
  vive em `service-mp.ts`/`service-mp-ops.ts`/`mp-status.ts`/`charge-state.ts` (todos ≤100).
  Fatorizar o legado fica para um ticket de refactor próprio.
- **`fetchImpl` entra como option aditiva** (CONSTRAINTS 5) — seam de teste; produção usa o
  fetch global.
- **Idempotência determinística**: chave = `pos-terminal:<session_id>:<propósito>`; sem id de
  sessão o initiate FALHA ALTO (nunca chave aleatória = nunca ordem duplicada); id de sessão
  fora do alfabeto da external_reference também falha alto (sem sanitização silenciosa).
- **`action_required` é ABSORVENTE no nível da order** (doc oficial: "will not change") —
  quem confirma o resultado é a TRANSAÇÃO: `payments[].status = "processed"` ou
  `status_detail = "accredited"` promove o charge para `paid` (senão permanece com copy de
  "verifique o terminal").
- **Cancelamento em `awaiting_terminal`** envia o header condicional
  `x-allow-cancelable-status: at_terminal` (contrato oficial; sem ele só `created` cancela).
- **Reembolso** (ERRATA da rodada 2): o core passa `refund.raw_amount` — objeto
  `BigNumberRawValue { value }` em unidades MAIORES (@medusajs/payment 2.21.2) — normalizado
  para minor e comparado com o `amount_minor` do blob (diferente = recusa ANTES da
  adquirente; ausente = falha alto).
- **Cancelamento**: header `x-allow-cancelable-status: at_terminal` INCONDICIONAL — a MP
  carrega a ordem no terminal em segundos e o blob local chega atrasado (o header é
  concessão, sem efeito adverso documentado em `created`).

## 2. Decisões de desenho

- **Falhar alto**: `validateOptions` aceita `manual` e `mercadopago`; registro `mercadopago`
  sem credencial nas options **falha no boot** (nunca degradar para manual).
- **Estado no blob `data`** (sem DB próprio): `charge_id`, `acquirer`, `state`, `data_version`
  (CONSTRAINTS 6 — versiona desde o primeiro estado novo).
- **Mutator único**: `transition(from, to)` valida contra `ALLOWED_TRANSITIONS` e rejeita
  transição proibida com erro tipado; poll e (futuro) webhook convergem nele (CONSTRAINTS 2).
- **Mapeamento ChargeState → status Medusa** (getPaymentStatus, nunca lança — erro degrada
  `pending`). ERRATA DO BUILD (verificado no @medusajs/types 2.21.2): `PaymentSessionStatus`
  NÃO tem `requires_action` nem `refunded` — a união real é `authorized | captured | pending |
  requires_more | error | canceled | pending_authorization`. Mapeamento final:
  `pending` → `pending`; `awaiting_terminal`/`action_required` → `pending_authorization`
  (o "confira o terminal" do caixa vem da view, nas rotas do T4); `paid` → `authorized`
  (capture do core segue; capture do adapter é confirmação LOCAL); `failed` → `error`;
  `expired`/`canceled` → `canceled`; `refunded` → `captured` (refund vive no PAYMENT; a
  reconciliação é do T5).
- **Janelas de poll**: transições típicas ≤10s; `action_required` até 40s — o plugin **não
  desiste antes de 40s** e **NUNCA converte tempo em falha**: `expired` só vem do estado da MP.
- **Logs D1/D2**: `logger_` com `provider_id`, charge id, `external_reference`, `attempt`;
  `info` = transição de estado (antes→depois); `warn` = 409 fila de terminal/4xx; `error` = 5xx;
  nunca credencial/token (D3).

## Acceptance Criteria

- [ ] MUST: `resolveAdapter` para manual/mercadopago/desconhecida (falha alta na desconhecida)
      — verify: `pnpm exec vitest run` (`__tests__/adapters.spec.ts`)
- [ ] MUST: MpAdapter create/get/cancel/refund no contrato, idempotency key por parâmetro,
      dinheiro minor→decimal pela `money.ts` — verify: `__tests__/adapter.mercadopago.spec.ts`
- [ ] MUST: `ALLOWED_TRANSITIONS` + `transition(from,to)` com teste de TODAS as transições
      válidas e rejeição das proibidas — verify: `__tests__/charge-state.spec.ts`
- [ ] MUST: provider mercadopago persistindo `charge_id`/`acquirer`/`state`/`data_version` no
      initiate e `getPaymentStatus` mapeando os 7 estados sem lançar — verify:
      `__tests__/service.mp.spec.ts`
- [ ] MUST: poll não reporta timeout como falha (`awaiting_terminal`→`pending`;
      `action_required`→`requires_action`) — verify: `__tests__/service.mp.spec.ts`
- [ ] MUST: logs D1/D2 nas transições com campos de correlação e sem credencial (spy do
      `logger_`) — verify: `__tests__/service.mp.spec.ts`
- [ ] MUST: `validateOptions` manual|mercadopago, com falha no boot sem credencial — verify:
      `__tests__/service.mp.spec.ts`
- [ ] MUST: arquivos ≤100 linhas — verify: `opcore check --repo . --all`
- [ ] MUST: lint/format/typecheck/knip verdes — verify: bateria local + steps do CI
- [ ] MUST: cobertura global ≥90% e money paths ≥95% — verify: `pnpm test:coverage`
- [ ] SHOULD: nenhuma dependência nova em `dependencies` — verify: diff do package.json
