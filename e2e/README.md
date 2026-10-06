# E2E — pos-payments (isolado do código do plugin)

Estrutura separada do resto da implementação, conforme decisão do workflow de
engenharia. Não roda em CI: exige backend vivo, túnel e credenciais reais de
sandbox do Mercado Pago. Proveniência textual `[ok] / [pendente]` — sem emoji.

## Onde está e o que cada script cobre

| Script | Camada | O que cobre | Estado |
|---|---|---|---|
| `mp-smoke-l2-full.cjs` | L2 — adapter isolado | Matriz oficial de simulação da Orders API (processed/failed/canceled/expired/action_required/refunded), janelas 10s/40s, guard MP_POINT_TEST_MODE, colisão de idempotência 409 + recuperação por busca, reuse-guard (valor/terminal), cancel com `x-allow-cancelable-status: at_terminal`, refund total + resiliente por estado, taxonomia de recusa, terminais (list). | 17/17 `[ok]` 2026-10-05 |
| `l3-webhook-e2e.cjs` | L3 — webhook E2E ponta a ponta | Login admin → draft-order → payment collection → payment session com `terminal_id` (initiate cria a charge) → replay pela rota admin (mesma ordem via idempotência) → simulate processed → entrega REAL do MP → funnel → proxy → rota nativa do core → event bus → HMAC + re-fetch → captura (assert por psql) → simulate refunded → reconciliação do subscriber → Refund no core → dedup (redelivery assinada ×2) → negativo sem assinatura. | 11/13 `[pendente]` 2026-10-05 — falhas (`webhook.captured`, `webhook.refunded`) dependem do secret vigente do painel MP, que diverge do `.env` |
| `pos-hooks-proxy.mjs` | Infra do túnel | Proxy da porta 8443: só `/hooks/payment/*`, stripa o prefixo `pp_` do segmento do provider (o painel MP tem a URL COM `pp_` e entrega com `pp_` no path; o core 2.19 monta `pp_${param}` incondicionalmente — sem o strip o provider viraria `pp_pp_`), telemetria em `/tmp/proxy-hits.log` (path, presença de rid/sig, retry) e `/tmp/proxy-bodies.log` (**só metadados**: tamanho do corpo, presença de rid/sig — assinatura, rid e corpo NUNCA são gravados em valor, porque formam material de replay; o validador não checa expiração). | `[ok]` em uso no L3 |
| `legacy/mp-smoke-cancel.cjs`, `legacy/mp-smoke-t21.cjs` | L2 anteriores | Smokes iterativos do T2/T6 (cancel e guard test-mode). Mantidos como evidência; superseded por `mp-smoke-l2-full.cjs`. | referência |

## Dependências

- Backend Medusa 2.19 no WSL (`:9000`) com o provider `pp_pos-terminal_mercadopago`
  registrado **flag-gated** (`POS_PAYMENTS_MP_TEST=true`) e o build do plugin no
  store do gerenciador de pacotes do backend (o symlink manual para a
  working copy é instável — copiar o build por cima do pacote).
- Túnel Tailscale Funnel apontando para o proxy `:8443` (que repassa à `:9000`
  com o path `/hooks/payment/<provider>` sans `pp_`).
- Container docker `pos-postgres` para os asserts de estado (a API admin 2.19
  não expõe retrieve da collection).
- Credenciais lidas do `.env` do backend em runtime (`MP_ACCESS_TOKEN`,
  `MP_WEBHOOK_SECRET`, `MEDUSA_ADMIN_EMAIL/PASSWORD`, `DATABASE_URL`).
  **Segredo nunca hardcoded e nunca logado.**

## Como executar (WSL)

```bash
export PATH="$HOME/.volta/bin:$PATH"   # node/pnpm do ambiente do backend
cd <raiz do repo>
node e2e/mp-smoke-l2-full.cjs          # L2 — não exige backend, só token de teste
node e2e/l3-webhook-e2e.cjs            # L3 — exige pilha completa de pé
```

Retry embutido no L3 para a fila do simulador SBX0000001 (compartilhada com
terceiros integradores; 409 `already_queued_order_on_terminal` é transitivo).
O L3 lê as credenciais do `.env` apontado por `BACKEND_ENV_FILE`
(`BACKEND_ENV_FILE=<caminho do .env do backend> node e2e/l3-webhook-e2e.cjs`).
Limitação conhecida do passo `dedup`: enquanto o secret vigente do painel não
estiver no `.env` (passo humano), as entregas assinadas do teste são descartadas
na assinatura e a asserção de não-duplicação não é discriminante — ela volta a
sê-lo no rerun pós-secret (13/13).

## O que o E2E NÃO cobre hoje (lacunas)

- `action_required` e `expired` no E2E de backend completo (hoje só na L2).
- Cancel de charge no E2E de backend (cancel coberto na L2 e smokes legados).
- Webhooks fora de ordem (refunded chegando antes do processed) e corridas
  entre poll e webhook.
- Reconciliação de refund quando o event bus esgota as tentativas (3×) —
  hoje não há job periódico (follow-up do ticket T9).
- Fluxo pelo app de caixa (payment-dialog) e comportamento de `markAsPaid`.
- Refund parcial (fora de escopo v1: Point é total-only, fail-closed).
- Terminais por caixa / setup de PDV (passo L4, terminal físico).

## Estado da pilha L3 (snapshot 2026-10-05)

- Entregas reais do MP chegam na rota nativa com 200 e são descartadas na
  validação HMAC: provado por eliminação (10+ variantes do canonical com o
  secret do `.env`) que o validador do plugin está correto e o secret vigente
  do painel mudou desde 04-10. Desbloqueio: passo humano (revelar/resetar a
  "Assinatura secreta" no painel, logado com a conta de teste) → atualizar
  `MP_WEBHOOK_SECRET` no `.env` → rerun do L3 (expectativa 13/13).
