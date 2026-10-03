# Spec: Fase 2 — T2 taxonomia de status (mapStatus) do Mercado Pago

Extraída para o gate P1 do ADLC (ticket `T2`). Fontes do contrato: máquina de estados oficial
da Orders API (Point e QR — status-order-transaction, verificação 2026-10-01), política de
adapters fail-closed (ADR 0001 §6) e erros tipados (ADR 0002). O cliente HTTP existe (T1);
este ticket adiciona a camada PURA de interpretação de estado.

## 1. Escopo do ticket

Mapeamento puro `MpOrder → ChargeStatusView` (estado do charge + motivo legível no caixa), com
taxonomia de retentabilidade sobre `transactions[].status_detail`:

- `status-taxonomy.ts` — tipos `RetryClass`, tabela normativa `RETRY_TAXONOMY` (11
  `status_detail` documentados → classe + copy pt-BR para o operador do caixa).
- `status.ts` — `ChargeState`, `ChargeStatusView`, `mapOrderStatus(order)` type-aware e
  fail-closed.

Fora de escopo: wiring no provider (T3), rotas (T4), webhook/reconciliação (T5).

## 2. Máquina oficial e decisões

- Point: `created → at_terminal → processed | failed | action_required | expired | canceled`;
  `canceled` pode vir do TERMINAL; `refunded` pode ser iniciado no terminal; `created` expira
  em 15 min sem processamento (server-side → `expired`).
- QR: `created → processed` direto; NÃO existem `at_terminal`/`action_required`/`failed` —
  recebê-los numa ordem `type: "qr"` é violação de contrato.
- O `status_detail` rico vive na TRANSAÇÃO (não na order). Taxonomia normativa:
  - `retry_with_change` (operador ajusta valor/dados): `insufficient_amount`,
    `amount_limit_exceeded`, `bad_filled_card_data`, `invalid_installments`
  - `not_retryable` (recusa igual ao repetir): `rejected_by_issuer`, `card_disabled`,
    `max_attempts_exceeded`
  - `retryable` (pode tentar de novo): `high_risk`, `processing_error`
  - `escalate` (escala humana): `in_review`, `required_call_for_authorize`
- Estado do charge (`ChargeState`): `pending`, `awaiting_terminal`, `action_required`, `paid`,
  `failed`, `expired`, `canceled`, `refunded`. NENHUM estado MP produz `processing` no v1
  (decisão registrada; o poll do T3 não sintetiza estado otimista).
- Fail-closed TOTAL: status fora do enum e estado proibido na máquina qr → `MpContractError`
  (nunca default silencioso). `status_detail` desconhecido → degradação conservadora
  (`not_retryable`) com `reasonCode` cru preservado; copy nunca vazia.
- Cancelamento distingue origem: status da transação `canceled_by_api` | `canceled_on_terminal`
  vira `reasonCode` com copy própria.

## Acceptance Criteria

- [ ] MUST: mapeamento total dos 8 estados point e dos 5 válidos qr, sensível ao `type`
      — verify: `pnpm exec vitest run` (`__tests__/status.spec.ts`)
- [ ] MUST: fail-closed — status fora do enum e estado proibido na máquina qr lançam
      `MpContractError` — verify: `__tests__/status.spec.ts`
- [ ] MUST: taxonomia normativa completa (11 status_details → 4 classes) com copy pt-BR não
      vazia por entrada — verify: `__tests__/status-taxonomy.spec.ts`
- [ ] MUST: `status_detail` desconhecido degrada para `not_retryable` preservando o
      `reasonCode`, sem lançar — verify: `__tests__/status.spec.ts`
- [ ] MUST: cancelamento expõe origem api/terminal; `refunded` expõe estado próprio
      — verify: `__tests__/status.spec.ts`
- [ ] MUST: arquivos ≤100 linhas — verify: `opcore check --repo . --all`
- [ ] MUST: lint/format/typecheck/knip verdes — verify: bateria local + steps do CI
- [ ] MUST: cobertura global ≥90% e money paths ≥95% — verify: `pnpm test:coverage`
- [ ] SHOULD: nenhuma dependência nova em `dependencies` — verify: diff do package.json
      contra a base
