# ADR 0004 — Onboarding do lojista: tela própria em Settings + wizard do plugin (sem onboarding nativo do Admin)

- **Status:** Aceito
- **Data:** 2026-09-26
- **Escopo:** UI de admin e estado de onboarding do `@voolulabs/medusajs-plugin-pos-payments`
  (Fase 2b)

## Contexto

O plugin precisa de uma superfície administrativa para o processo mais crítico do produto: conectar
o lojista às adquirentes (OAuth, credenciais coladas, pareamento de terminal, provisionamento) e
manter essas conexões saudáveis. Três fatos verificados nas fontes primárias definem o espaço de
desenho:

1. **O Admin Medusa 2.19 não tem onboarding nativo** — busca zerada por "onboarding" em todo
   `packages/admin` no tag `v2.19.0` e no `develop` (2.21.1): nenhuma rota, zona de injeção, API,
   hook ou estado. A página home é um redirect para `/orders`. O widget de onboarding existia no
   **v1** como código do backend scaffolding (widget + tabela `onboarding_state` + rota admin) e
   não sobreviveu ao v2. Não há o que "entrar" ou estender.
2. **A mecânica de extensão é madura e oficial**: plugin entrega UI via `src/admin/routes|widgets`
   → `medusa plugin:build` gera `.medusa/server/src/admin/index.mjs|js` → export `./admin` → o
   host carrega automaticamente pelo array `plugins`. Rotas sob `src/admin/routes/settings/**` caem
   na área **Settings** do dashboard (classificação por regex `/^\/settings\//`); exemplo oficial
   com formulário de settings completo: `medusajs/examples/invoice-generator`
   (`settings/invoice-config/page.tsx`). Zonas úteis confirmadas na lista autoritativa
   (`INJECTION_ZONES`, `admin-shared`): `order.details`, `store.details`, `region.details`,
   `topbar`; **não existe** zona em página de payment providers nem zona "home".
3. **O ecossistema de plugins de pagamento é config-only, e o padrão de settings dinâmicos é
   tabela do plugin**: o plugin oficial SumUp↔Medusa tem `src/admin` vazio (credenciais só em
   `medusa-config`/env); Stripe core idem. Plugins que precisam de credenciais/estado dinâmicos
   por loja (RSC Labs `medusa-documents` v2) usam o trio **formulário no Admin → rotas
   `/admin/*` do plugin → tabelas do próprio plugin (migrations)** — nunca `store.metadata`.
   O único precedente de OAuth-connect em admin é v1 (QuickBooks) com **redirect full-page** do
   navegador; popup/iframe não tem precedente.

## Opções consideradas

1. **Integrar ao onboarding nativo do Admin** — **impossível**: não existe onboarding nativo no
   v2 (fato 1); não há zona, rota ou API para estender.
2. **Config-only via env/`medusa-config`** (padrão dos plugins de pagamento) — **rejeitada**: as
   credenciais aqui são **por lojista e por adquirente**, chegam em runtime (OAuth, colagem) e
   têm estado vivo (expiração, rotação, reconexão, pareamento). Env resolve credenciais de
   **plataforma** (client_id/secret, `ServiceRefererName`), não de lojista.
3. **Só widgets nas páginas existentes** — **rejeitada como superfície principal**: não há zona em
   payment providers/home; um wizard multi-passo (pareamento com contagem, painel de KYC,
   formulários por adquirente) não cabe em widget de detalhe. Widgets ficam como **suporte**
   (indicadores + deep-link).
4. **Tela própria em Settings + wizard do plugin com estado próprio** — **escolhida**.

## Decisão

1. **Superfície única de onboarding/config: rota `settings/pos-payments`**
   (`src/admin/routes/settings/pos-payments/page.tsx` → `/app/settings/pos-payments`, área
   Settings). Anatomia: estado geral das conexões, cards por adquirente com `StatusBadge` do
   estado da conexão (máquina própria do plugin), wizards em `FocusModal` por modelo de
   conexão (OAuth, credencial colada, pareamento SumUp, painel de recebedores Stone, ISV Cielo),
   tabela de terminais (`DataTable`) com health e seleção. Estado do onboarding é **do plugin**
   (tabelas `pos_payments_*` com migrations na Fase 2b),
   precedido no primeiro uso por um estado de "setup" na própria página.
2. **OAuth por full-page redirect com callback no backend**: a página navega para `authorize_url`
   devolvida por `POST /connections/:acquirer/start`; a adquirente retorna para a rota pública
   `/pos-payments/callback/:acquirer`, que valida `state` (durável, uso único), troca o código e
   redireciona de volta para a página com `result=ok|error`. Sem popup/iframe.
3. **Widgets de suporte**: conciliação em `order.details` e, opcional,
   indicador de setup incompleto em `topbar`/`store.details` com deep-link para a página.
4. **Componentes**: `@medusajs/ui` + `@medusajs/icons` + `react-hook-form` + zod, dados via
   `sdk.client.fetch` (auth de sessão do dashboard) com React Query **do host** (não instalar
   TanStack Query no plugin). Componentes internos do dashboard (`@medusajs/dashboard/…`) não são
   usados no alvo 2.19 (o export `./components` existe no 2.19, mas se limita a
   `LayoutComposer`/`ConfigurableDataTable`; os internals só entram no export a partir de 2.21).

## Justificativa da escolha

- **Processo crítico merece tela própria**: onboarding concentra UX multi-passo, estados vivos e
  audit — reduzir a widgets fragmentaria o fluxo; config-only esconderia estados do operador
  (reconectar, pareamento expirado, KYC pendente) que hoje só existem nos portais das adquirentes.
- **Aderente ao platform design**: a escolha usa apenas mecanismos oficiais verificados (rota em
  Settings + zonas + export `./admin`), com o `invoice-generator` como análogo oficial direto —
  zero dependência de comportamento não documentado.
- **Padrão de dados consolidado**: tabela do plugin é a convenção do ecossistema para settings
  dinâmicos (fato 3) e é o mesmo desenho do widget de onboarding do v1 (`onboarding_state`) —
  história do próprio Medusa validando a arquitetura.

## Consequências

**Positivas**
- Onboarding inteiro do lojista em um lugar (Admin), com audit e estados explícitos; o app de
  caixa só consome.
- Plugin permanece publicável por npm com a mecânica padrão (`files`/`exports` + `plugin:build`);
  o lojista-host não configura nada além do array `plugins`.

**Negativas / riscos aceitos**
- **Migrations a partir da Fase 2b** — o "sem migrations" fica escopado ao v1/Fase 1;
  host que atualizar o plugin roda migrations do plugin.
- **UI é superfície a manter** no monorepo do plugin (React/Vite + peerDeps `react`, `react-dom`,
  `@medusajs/ui`, `@medusajs/icons`, `@medusajs/admin-sdk`) — bundle maior e contrato visual
  segue a versão do dashboard do host; mitigação: colar no `@medusajs/ui` (design system estável)
  e não em internals.
- **Full-page redirect tira o operador do dashboard** por alguns segundos (fluxo do adquirente);
  mitigação: retorno sempre para a página com `result` e re-fetch automático.

**Compliance (checklist):** segredos de lojista só em `pos_payments_credential`
criptografado (AES-256-GCM envelope); `state` OAuth durável e de uso único;
audit de todos os eventos de conexão; rotas de onboarding admin-only com teste de escopo no CI.
