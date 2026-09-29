# ADR 0005 — Superfícies de API: rotas autenticadas sob `/admin/pos-payments/*`, callback público em `/pos-payments/*`, webhook na rota nativa sem `pp_`

- **Status:** Aceito
- **Data:** 2026-09-26
- **Escopo:** rotas e autenticação do `@voolulabs/medusajs-plugin-pos-payments`
  (estrutura: [ADR 0002](0002-estrutura-convencoes-plugin-medusa-v2.md); contratos:
  [onboarding.md](../onboarding.md) §5.1, plano §6.3)
- **Base:** fonte `medusajs/medusa` tag **v2.19.0** (clone local `.cache-medusa-src/`), caminhos
  citados por arquivo/linha.

## Contexto

As rotas do plugin têm **dois consumidores com credenciais diferentes**:

1. **App de caixa (medusa-pos)** — JWT de admin em `Authorization: Bearer` (app com SDK em modo
   `jwt`, token persistido por login).
2. **UI do plugin dentro do Admin Medusa** — o dashboard roda o SDK em modo **session**
   (`packages/admin/dashboard/src/lib/client/client.ts` — default `session`) e, nesse modo, o
   js-sdk **não anexa `Authorization` em requisição alguma** — envia **apenas o cookie** de
   sessão (`packages/core/js-sdk/src/client.ts:362-370` e `:83-86`).

A primeira proposta do plugin usava `/pos/payments/*` para as rotas autenticadas, contando com o
matcher do plugin narisolutions (`/pos/*` → `authenticate("user", ["bearer"])`). Três fatos do
fonte v2.19.0 tornam isso inviável para o consumidor com cookie:

1. **`authenticate(actorType, authTypes)` filtra capacidades localmente** — sessão só é
   considerada se `"session"` estiver na lista; bearer só se `"bearer"` estiver
   (`packages/core/framework/src/http/middlewares/authenticate-middleware.ts:192,214`). Uma
   requisição **só de cookie** contra `authenticate("user", ["bearer"])` → **401**
   (`:129`).
2. **Middlewares de plugins diferentes se acumulam (Express stack), e o matcher pai corre
   antes do filho**: o coletor concatena todos os `middlewares.ts`
   (`framework/src/http/router.ts:96-117,180-196`) e o `RoutesSorter` emite o nó pai antes do
   filho para middlewares sem método (`routes-sorter.ts:204-215,252-255`). O `authenticate`
   bearer-only de `/pos/*` responde 401 sem `next()` — **um middleware nosso mais permissivo em
   `/pos/payments/*` nunca chega a rodar para requisições de cookie**. Auth types não fazem
   union entre configs.
3. **O núcleo já autentica todo `/admin/*` com os três tipos**:
   `authenticate("user", ["bearer", "session", "api-key"])`
   (`framework/src/http/router.ts:503-507`) — prefixo aplicado a qualquer rota registrada sob
   `/admin`, incluindo rotas de plugin (as rotas admin do core não re-autenticam).

Fato adicional verificado que corrige o desenho do webhook: a rota nativa
`POST /hooks/payment/[provider]` recebe o segmento **sem o prefixo `pp_`** e o módulo
re-prefixa para resolver o provider no container (`packages/modules/payment/src/services/
payment-module.ts:1455-1465` monta `pp_${eventData.provider}`; a chave de registro é
`pp_${identifier}${id ? "_"+id : ""}` em `loaders/providers.ts:24-26`). Provider desconhecido →
o webhook responde 200 e o erro explode no subscriber com re-tentativa (3x).

## Opções consideradas

1. **Manter `/pos/payments/*` e "alargar" a auth com middleware próprio**
   (`authenticate("user", ["session","bearer"])`) — **rejeitada**: pelo fato 2, o 401 do
   matcher `/pos/*` corre antes e mata a requisição de cookie; os tipos não se unem.
2. **Duas superfícies** — `/pos/payments/*` para o app (bearer) e `/admin/pos-payments/*` para o
   Admin (cookie) — **rejeitada**: duplicação de handlers sem benefício; o core aceita
   **bearer** em `/admin/*` (fato 3), então o app de caixa funciona na mesma superfície.
3. **Mudar o matcher do plugin narisolutions** — **rejeitada**: repo de terceiro, não é nosso.
4. **Rotas autenticadas sob `/admin/pos-payments/*`** — **escolhida**.

## Decisão

1. **Rotas autenticadas: `/admin/pos-payments/*`** (`src/api/admin/pos-payments/…` no plugin) —
   cobertas pela autenticação do core (`bearer` para o app de caixa, `session` para a UI do
   Admin, `api-key` para automação). O `middlewares.ts` do plugin **não declara authenticate**
   para essas rotas (o core já autenticou); apenas validadores/rate-limit próprio, se necessário.
2. **Callback OAuth público: `GET /pos-payments/callback/:acquirer`** — inalterado; namespace
   fora de `/pos/*` (sem colisão: `/pos-payments` ≠ `/pos/…`) e sem auth (protegido por `state`,
   [onboarding.md](../onboarding.md) §7).
3. **Webhooks: rota nativa do core com segmento sem `pp_`** —
   `https://<backend>/hooks/payment/pos-terminal_<id>` (ex.: `pos-terminal_mercadopago`). O
   provider resolve pelo id completo `pp_pos-terminal_<id>` internamente.
4. **Rate limit**: fora do orçamento 429 de `/pos/*` do narisolutions — se as rotas de
   charge/poll precisarem de limite próprio, entra no `middlewares.ts` do plugin por matcher
   `/admin/pos-payments/*` (plano §2.6).
5. **Cautela de matcher**: nenhum matcher próprio do plugin pode varrer o callback público
   (um `authenticate` em `"/pos-payments*"` casaria `/pos-payments/callback/...` e o 401aria) —
   matchers do plugin ficam restritos a `/admin/pos-payments/*`.

## Consequências

**Positivas**
- Único conjunto de handlers para os dois consumidores; zero acoplamento ao matcher do
  narisolutions (a convivência deixa de ser requisito de desenho).
- UI do Admin e app de caixa usam exatamente os mesmos URLs; testes de auth cobrem os três
  tipos de credencial do core.

**Negativas / riscos aceitos**
- Dependência do prefixo de auth `/admin` do core (comportamento estável e publicamente
  documentado; re-verificar em upgrade de versão — gatilho: mudança em
  `framework/src/http/router.ts`).
- O webhook **sem `pp_`** na URL é contraintuitutivo — registrado aqui e no plano (§6.3);
  config nos portais das adquirentes usa o segmento curto.
- Provider desconhecido no webhook responde 200 e retry no subscriber (comportamento do core) —
  monitorar tentativas repetidas de provider inexistente como sinal de URL mal configurada.

> **Comportamento do event bus nessa superfície** (fila, subscriber do core, retry,
> durabilidade): [event-bus.md](../event-bus.md) — verificado no fonte v2.19.0 (2026-09-27).
