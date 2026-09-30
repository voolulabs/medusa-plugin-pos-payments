# ADR 0006 — Branching e versionamento (plugin pos-payments e repos da família)

- **Status:** Aceito
- **Data:** 2026-09-27
- **Escopo:** novo repo `@voolulabs/medusajs-plugin-pos-payments` (Fase 1) e alinhamento com
  `medusa-pos`, `store-b2c-boilerplate` e `medusa-plugins`.

## Contexto

A família já opera um modelo de facto: **branching por ambiente** (`develop → staging → main`, "never skip steps"), publicação disparada por **tag `v*` na main** (workflow npm com `NPM_TOKEN`), bumps explícitos `chore(release): vX.Y.Z` e tags `v0.x.y`. Commits são *estilo* Conventional, porém **não
enforçados** (histórico tem `docs:` e `Docs:` misturados). O core Medusa usa **changesets**
(monorepo); o boilerplate next-enterprise embute **semantic-release** (não usado); o
`store-b2c-boilerplate` segue o upstream FUNKYTON (`master` + `staging`, sem tags). No
ecossistema, plugins convivem com minors rápidas do Medusa (2.19 → 2.21): o plugin oficial SumUp
usa peer `^2.15.5`; plugin comunitário pinado em `2.12.4` quebrou a compatibilidade — anti-padrão.
Nossas regras de release já fixadas (engenharia.md §4): semver aplicado à superfície (exports,
provider id/options, payload de webhook, faixas de peerDep), Keep-a-Changelog, provenance +
`npm audit signatures`.

## Decisões

1. **Branching = modelo da casa, estendido ao repo novo** (igual a `medusa-plugins`):
   `develop → staging → main`, apenas essas três longevas; features curtas `feat/*`, `fix/*`
   nascem de `develop` e entram **só por PR**. Release = `develop → staging → main` + **tag
   `v*` na main** dispara o publish (nunca tag em develop). `staging` alimenta o ambiente de
   homologação — enquanto ele não existe, a branch fica provisionada porém dormente, e a
   semântica de ambiente é carregada pelas dist-tags do npm (`next` = homologação,
   `latest` = produção); `main`, a produção.
2. **Conventional Commits enforçados por CI** (commitlint no push/PR), com scopes dos adapters
   (`feat(mercadopago):`, `fix(cielo):`) — resolve a inconsistência do histórico sem mudar o
   mecanismo de release da casa.
3. **Versionamento = bump manual em PR `chore(release): vX.Y.Z` + tag `v*` → publish.**
   Sem semantic-release e sem changesets: repo **single-package** não justifica changesets
   (ferramenta de monorepo — adotar só se o fatiamento do ADR 0002 §3.4 acontecer), e o
   semantic-release do boilerplate conflita com o fluxo tag-triggered da casa. O workflow de
   publish **só roda se a tag bate com o `version` do package.json** e publica com
   `--provenance` a partir da `main`. CHANGELOG em Keep-a-Changelog, gerado dos commits
   convencionais (git-cliff) a partir da `0.1.0`.
4. **SemVer do plugin — contrato de 1.0.0:** durante o piloto privado (Fases 1–2) fica em
   **`0.x`** — breaking pode entrar em MINOR (semver §4) e o backend consome **versão exata**
   (em `0.x`, caret só pega patch). **`1.0.0` congela o contrato público** (gatilho: primeiro
   lojista em produção): a partir daí quebrar exports, provider id/options, payload de webhook,
   rotas ou faixa de peerDep = MAJOR (engenharia.md §4).
5. **Compatibilidade Medusa = política de versão:** peer range **`>=2.15 <3`**; a matriz de CI
   roda contra as minors suportadas (a que produzimos + a última 2.2x). **Dropar uma minor do
   range = MINOR; suportada e quebrada = MAJOR.** Nunca peer pinado exato (anti-padrão
   `2.12.4`).
6. **Prereleases:** `-rc.N` publicados pelo **mesmo fluxo da estável** — tag `v*` na `main` (o
   guard do publish só aceita tag ancestral de `main`; errata 2026-09-30: não existe caminho de
   publish a partir da `staging`). Dist-tag derivado da versão no workflow: prerelease →
   **`next`**; estável → `latest`. Backend de homologação consome `next`; produção, `latest`.
7. **Versionamento independente por repo:** plugin (`@voolulabs/*`) e app (`medusa-pos`) não
   sincronizam números — a compatibilidade app ↔ plugin ↔ Medusa é documentada (matriz no plano
   §2), não acoplada por versionamento. `store-b2c-boilerplate` segue o upstream (master+staging,
   sem semver próprio) enquanto o boilerplate comandar.
8. **Gate de release da família: o E2E.** A publicação estável (`latest`) exige o E2E de vendas
   (`scripts/e2e-pos.mjs`) verde contra um backend real executando a versão candidata. A candidata
   chega ao backend antes da estável por um dos caminhos: prerelease `-rc.N` no dist-tag `next`
   (§6) ou registry local de ensaio (Verdaccio no dev) enquanto a homologação não existe. O
   script vive no backend e é o teste de contrato da família; o procedimento de release do
   backend o lista como passo obrigatório.

## Consequências

- Zero ferramental novo na Fase 1 além do workflow de publish: mesmos mecanismos do fluxo da
  casa (publish por tag) + um job commitlint; git-cliff entra na `0.1.0`.
- Durante `0.x`, atualizar o plugin no backend é ato deliberado (versão exata) — custo aceito
  no piloto, revertido no 1.0 com faixa `^1.x`.
- A matriz de minors do Medusa no CI é a materialização da faixa de peer: se a matriz crescer
  demais, dropar a minor mais antiga é MINOR (anunciar no CHANGELOG).
- Prerelease `next` cria o hábito de homologar a staging com o pacote que será publicado —
  fecha o risco do postBuild/tarball (o backend consome o plugin sempre do registry).

## Referências

- ADR 0001 (pin de SDKs) · ADR 0002 (superfície semver e reuso) · ADR 0005 (superfícies de API)
- [Conventional Commits](https://www.conventionalcommits.org/) ·
  [semver §4 (0.x)](https://semver.org/) ·
  [npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/) ·
  Medusa core: `.changeset/` (v2.19.0 — referência de monorepo, não adotado)
