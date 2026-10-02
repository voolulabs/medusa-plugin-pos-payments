# CLAUDE.md — medusa-plugin-pos-payments

## O que é

Monorepo pnpm do plugin de pagamentos de terminal BR (`@voolulabs/medusajs-plugin-pos-payments`):
provider `pos-terminal` (identifier fixo) para Medusa v2 — Fase 1 manual/terminal-presente
(`pp_pos-terminal_card|pix|cash|transfer`); adapters por adquirente (Mercado Pago, SumUp, Stone,
Cielo) entram como diretórios `src/adapters/<acquirer>/` a partir da Fase 2, atrás da interface
comum `src/adapters/types.ts`.
Fonte de verdade: ADRs em `docs/adr/` (0001–0006, com erratas datadas).

## Build e verificação

```bash
pnpm exec medusa plugin:build   # build (swc, .medusa/server) — NÃO typecheca
pnpm run typecheck              # tsc --noEmit — OBRIGATÓRIO antes de declarar pronto
pnpm exec vitest run            # suíte unitária (specs em src/**/__tests__)
pnpm lint && pnpm format:check  # ESLint (@medusajs/eslint-plugin) + Prettier
```

O typecheck pegou desvios reais de API que o swc deixaria passar (assinaturas 2.19,
`InitiatePaymentOutput.id`, `GetPaymentStatusOutput`, `override` em statics). Nunca pular.

## Padrões de engenharia (resumo executável; detalhes nos ADRs e CONSTRAINTS.md)

- **Dinheiro**: minor units (inteiros) + `MathBN` (`@medusajs/framework/utils`) — nunca float;
  conversão da unidade da adquirente documentada em um único lugar, com teste do caso de drift.
- **Estado**: `ALLOWED_TRANSITIONS` + mutator único `transition(from, to)`; webhook e poll
  convergem nele; `assertNever` em todo switch de status.
- **Contrato do `data`**: todo método do provider devolve o blob COMPLETO (o módulo substitui o
  estado — devolver `{}` clobberiza); `getPaymentStatus` nunca lança; falhar fechado em dinheiro
  (2xx não é dinheiro — re-consultar a adquirente antes de declarar autorizado/capturado).
- **Idempotência**: chave estável derivada e persistida ANTES do primeiro envio; retry reutiliza
  a MESMA chave; `idempotency_key_already_used` → re-consultar, nunca recriar.
- **Webhook é pista, não verdade**: HMAC timing-safe sobre raw bytes + re-fetch antes de mutar.
- **Fronteiras**: zod de `@medusajs/framework/zod`; rejeitar `__proto__`/`constructor`/`prototype`;
  merge depth-1.
- **Fail-closed**: sem credencial o adapter não sobe (presence-gated) — nunca degradar
  silenciosamente para outro provider.
- **Semver**: options de adapter são aditivas por design (renomear/remover = MAJOR — ADR 0006 §4).
- Orçamento de ≤100 linhas por arquivo em `src/` (ADR 0002, errata 2026-10-01) — aplicado em
  review e checado pelo opcore; imports relativos, sem aliases `@/` (ADR 0002 §7).

## Gates de verificação — dois toolchains distintos, papéis distintos

- **Ciclo ADLC** (`@adlc/cli` — voodootikigod/adlc): gates do ciclo de desenvolvimento com
  evidência — `spec-lint` (P1), `gate-manifest verify/record/attest` (seção abaixo).
- **Opcore** (`@the-open-engine-company/opcore` — the-open-engine, projeto DISTINTO do ADLC):
  higiene de código (sintaxe, complexidade, ciclos, duplicação) — `opcore check --repo . --all`
  no CI e no host de dev (binário nativo; roda no WSL). É a origem do orçamento de
  100 linhas/arquivo (ADR 0002, errata 2026-10-01). CI-only install: `OPCORE_NO_HOOKS=1`.

## Fluxo dev (backend de dev no WSL)

Ciclo oficial do CLI: `medusa plugin:publish` → `medusa plugin:add` → `plugin:develop` (watch).
Fallback em uso no WSL (o `postBuild.js` do backend roda `pnpm i --prod --frozen-lockfile`
dentro de `.medusa/server`, onde dependência `file:` externa quebra): após `plugin:build`,
copiar o pacote para `.medusa/server/node_modules/@voolulabs/medusajs-plugin-pos-payments` +
symlink em `node_modules/` raiz do backend. Produção = pacote do registry com **versão exata**
em 0.x (ADR 0006 §4).

## Ciclo ADLC (`@adlc/cli` — gates e evidência de desenvolvimento)

O CI é o backstop do ciclo: `adlc spec-lint` (P1 — todo critério de aceite precisa de método
de verificação) + `adlc gate-manifest verify` (integridade do ledger append-only
`.adlc/manifest.jsonl`; exit 0 com ledger vazio/ausente; exit 2 = cadeia quebrada).

Ciclo por ticket (código de dinheiro = risco alto):

1. **P0** — `adlc ticket create --input <t>.json --write` (mutação é dry-run sem `--write`);
   `adlc preflight` valida o ambiente.
2. **P1** — `adlc spec-lint <spec>.md --record --ticket <id>` → **aprovação humana** →
   `adlc gate-manifest record spec-approval --ticket <id> --files <spec>.md --data '{"approver":"…","verdict":"approved","spec_hash":"…"}'`.
3. **P2** — `adlc coldstart <id> --prompt-only` (sem chave de LLM: as lacunas são respondidas no
   shape exigido `{"gaps":[…],"ticketHash":"…"}`).
4. **P3** — `adlc rails-guard --base origin/develop --ticket <id> --record`; rails enxutos
   (`docs/adr/**`, `.adlc/config.json`, `.adlc/tickets/.store.json`) — nunca `.adlc/**` inteiro
   (o ledger é commitado a cada ciclo e rail largo faria o gate se autodenunciar).
5. **P5** — revisão adversarial externa (CodeRabbit no PR) →
   `adlc gate-manifest record code-rabbit --ticket <id> --data '{"verdict":…}'`. O nome de gate
   `prosecute` tem contrato próprio (2 passadas secas, ≥3 lentes, transcript com hash) — só usar
   com o contrato completo.
6. **P6** — **merge humano** → `adlc gate-manifest record merge-approved --ticket <id> --data '{"approver":"…","pr":…}'`
   + `adlc gate-manifest attest --ticket <id>` (tabela de evidência para o PR).

Disciplina do ledger: a sequência é contígua desde 1 — **rebase em `develop` antes de gravar
evidência** (merge fora de ordem quebra a cadeia); reparo:
`adlc gate-manifest repair-chain --reason "…"`.

Fora do fluxo, com motivo: `hollow-test` (mutação só em JS puro — o código é TypeScript),
`build-gate` (exige sinal de sessão fornecido por hook, que não existe neste setup),
`adlc accept` (exige a evidência P5 completa do contrato `prosecute`).

## CodeRabbit (revisão adversarial externa)

CLI `coderabbit` (0.8.2, `~/.local/bin/coderabbit`): `coderabbit review --agent --base origin/develop`
no P5. Requer auth (agentic key ou `coderabbit auth login`).

## Guardas de execução

- Commit/push só com autorização explícita do humano (hook bloqueia mecanicamente).
- Bateria completa ANTES de qualquer commit: `pnpm lint` · `format:check` · build · `vitest` ·
  `tsc --noEmit` · `pnpm knip` · `opcore check --repo . --all` · `adlc spec-lint` +
  `gate-manifest verify` · commitlint (invocação idêntica à do CI). Gate que nunca falhou não
  está provado — provar por mutation.
- Credenciais de adquirente NUNCA no app/terminal — credenciais de plataforma via
  env/constants no backend; credenciais dinâmicas por lojista só no armazenamento
  criptografado próprio do plugin (AES-256-GCM envelope, ADR 0004), nunca
  `store.metadata`.
- Rotas em `/admin/pos-payments/*` usam a auth do core (ADR 0005) — sem `authenticate` próprio;
  callback público em `/pos-payments/*`; webhook na rota nativa do core
  (`/hooks/payment/pos-terminal_<id>`, segmento sem `pp_`).
- Público nunca referencia documento interno; errata datada quando um ADR divergir do real.
