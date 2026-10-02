# Spec: Fase 2 — T1 cliente Orders API do Mercado Pago

Extraída para o gate P1 do ADLC (ticket `T1`). Fontes do contrato: Orders API oficial do
Mercado Pago (`POST /v1/orders`, `GET /v1/orders/{id}`, cancel/refund, `GET /terminals/v1`),
política de adapters em REST puro com idempotência e fail-closed (ADR 0001 §6), pirâmide de
testes e réguas de cobertura do pacote (engenharia §4).

## 1. Escopo do ticket

Cliente HTTP REST puro do adapter `mercadopago` — superfície Orders API + terminais, **sem**
regra de negócio de estado (o mapeamento de status é o ticket seguinte, T2). Padrão
functional core / imperative shell: construção de body e conversões puras e testadas; `fetch`
na casca com headers de idempotência.

- `src/adapters/mercadopago/client.ts` — criar ordem no terminal (`POST /v1/orders`),
  consultar (`GET /v1/orders/{id}`), cancelar (`POST /v1/orders/{id}/cancel`),
  reembolsar (`POST /v1/orders/{id}/refund`).
- `src/adapters/mercadopago/terminals.ts` — listar terminais (`GET /terminals/v1/list`) e
  setup de modo de operação (PDV).
- `src/adapters/mercadopago/types.ts` — formas normalizadas do adapter.
- `src/adapters/mercadopago/validation.ts` — zod de `@medusajs/framework/zod` na fronteira
  (parse, don't validate; `.passthrough()` preserva o raw da adquirente).

## 2. Requisitos obrigatórios (ADR 0001 §6)

- **Idempotência**: `X-Idempotency-Key` obrigatória em create/cancel/refund; chave derivada e
  persistida antes do primeiro envio (a persistência no provider é o ticket de wiring, T3);
  retry reutiliza a MESMA chave; `idempotency_key_already_used` → re-consultar o recurso,
  nunca recriar.
- **Dinheiro**: minor units (inteiros) no domínio; o `amount` do MP é **string decimal**
  (minor ÷ 100) — conversão única via `MathBN` com teste do caso de drift.
- **Contrato de criação**: `external_reference` (≤64 chars), `config.point.terminal_id`
  (serial), `expiration_time` ISO-8601; **`default_installments` NUNCA vai no payload**;
  cancelamento com `X-Allow-Cancelable-Status`.
- **Rede**: base URL fixa; token por options (presence-gated); `Authorization` nunca em log.
- **Falhar fechado**: resposta 2xx não é dinheiro — payload parseado com zod; fora do
  contrato → erro tipado, sem mutação de estado.

## Acceptance Criteria

- [ ] MUST: create/get/cancel/refund e terminais falando o contrato oficial, HTTP mockado com
      MSW — verify: `pnpm exec vitest run` (specs de `client`, `client.mutations`, `terminals`)
- [ ] MUST: idempotência em toda operação monetária — mesma chave no retry; colisão re-consulta
      em vez de recriar — verify: spec de mutações (`client.mutations.spec.ts`)
- [ ] MUST: conversão minor units → string decimal com teste do caso de drift — verify: spec
      de conversão
- [ ] MUST: payload sem `default_installments`; `external_reference`, terminal e amount
      validados ANTES do fetch (fail-closed) — verify: specs de validação
- [ ] MUST: orçamento de ≤100 linhas por arquivo — verify: `opcore check --repo . --all` (CI)
- [ ] MUST: lint/format/typecheck/knip verdes — verify: bateria local + steps do CI
- [ ] MUST: cobertura nas réguas do pacote (global ≥90%, money paths ≥95%) — verify:
      `pnpm test:coverage`
- [ ] SHOULD: nenhuma dependência nova em `dependencies` — verify: diff de
      `plugins/pos-payments/package.json` contra a base
