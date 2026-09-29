# CLAUDE.md — medusa-plugin-pos-payments

## O que é

Monorepo pnpm do plugin de pagamentos de terminal BR (`@voolulabs/medusajs-plugin-pos-payments`).
Fonte de verdade: `plano-pos-br.md` §6 (workspace `pos`) + ADRs em `docs/adr/`.
Gates ADLC em `.adlc/` (spec: `.adlc/specs/fase-1-provider-manual.md`).

## Build e verificação

```bash
pnpm exec medusa plugin:build   # build (swc, .medusa/server) — NÃO typecheca
pnpm run typecheck              # tsc --noEmit — OBRIGATÓRIO antes de declarar pronto
pnpm exec vitest run            # suíte unitária (specs em src/**/__tests__)
```

O typecheck pegou desvios reais de API que o swc deixaria passar (assinaturas 2.19,
`InitiatePaymentOutput.id`, `GetPaymentStatusOutput`, `override` em statics). Nunca pular.

## Fluxo dev (backend no WSL kxot-wsl)

Ciclo oficial do CLI: `medusa plugin:publish` → `medusa plugin:add` → `plugin:develop` (watch).
Fallback em uso no WSL (o `postBuild.js` roda `pnpm i --prod --frozen-lockfile` dentro de
`.medusa/server`, onde `file:`/yalc externo quebra — plano §6.4): após `plugin:build`, copiar
o pacote para `.medusa/server/node_modules/@voolulabs/medusajs-plugin-pos-payments` + symlink
em `node_modules/` raiz do backend. Produção = `npm publish` + versão fixa.

## Regras da casa

- Commit/push só com autorização explícita do humano (hook bloqueia mecanicamente).
- Credenciais de adquirente NUNCA no app/terminal — env/constants no backend.
- `middlewares.ts` não existe aqui: rotas em `/admin/pos-payments/*` usam a auth do core
  (ADR 0005). Imports relativos, sem aliases `@/` (ADR 0002 §7).
- Dinheiro: minor units + MathBN; `getPaymentStatus` nunca lança; todo método devolve o
  blob `data` completo (engenharia.md §1.11).
- Gates ADLC: `adlc spec-lint .adlc/specs/fase-1-provider-manual.md` (8/8) antes de abrir mão
  da spec; pós-commit: `hollow-test`, `rails-guard`, `gate-manifest`, `prosecute`.
- **Opcore** (`@the-open-engine-company/opcore` ≥0.3): verificação local (check/sense) +
  `opcore run pre-commit` — roda **no host WSL** (0.3 só publica linux/x64 e darwin/arm64;
  este mac é Intel e não roda). Lição da casa: **rodar TODOS os gates (adlc + opcore +
  vitest + tsc) antes de qualquer commit.**
