# ADR 0003 — Adapter Cielo: autorização REST no plugin + captura PPCONECTA no app

- **Status:** Aceito
- **Data:** 2026-09-26
- **Escopo:** adapter `cielo` do `@voolulabs/medusajs-plugin-pos-payments`
  (Fase 3)

## Contexto

O Cielo Conecta documenta **duas vias oficiais e mutuamente exclusivas** para executar a
transação presencial (fonte: portal docs.cielo.com.br/conecta, corpus de 205 páginas `.md`):

1. **REST `physicalSales`** — a Aplicação de Pagamento captura o cartão com a biblioteca
   **PPCONECTA** (Abecs; chip contato, contactless, tarja) e envia os dados criptografados para
   `POST /1/physicalSales/`; confirmação, desfazimento, voids e consultas também são REST.
   A documentação da PPCONECTA indica, comando a comando, o campo JSON correspondente
   (ex.: `PinBlock.EncryptedPinBlock`) — é o desenho oficial desta via.
2. **Client Conecta (DLL Windows / .so Linux)** — biblioteca *client TEF* que comanda o pin pad
   **e** executa a autorização pela função única `RequestDispatcher`; a documentação oficial
   orienta que a aplicação **não chame a API HTTP da Cielo diretamente** nessa via.

As duas vias dividem-se no mesmo ponto: **onde fica a autorização** — no backend (via 1) ou no
app de caixa via biblioteca nativa (via 2).

## Opções consideradas

1. **Via 2 completa (Client Conecta DLL)** — o app transacionaliza pela `RequestDispatcher`; o
    plugin fica fora do fluxo transacional (só gestiona/audita). **Rejeitada** (ver Decisão).
2. **Via 1 (REST + captura PPCONECTA no app)** — **escolhida**.
3. **Híbrido impossível** — usar a DLL para captura e o REST para autorização é explicitamente
    contraindicado pela Cielo (a DLL não expõe os dados de captura para isso e a orientação
    oficial proíbe misturar as vias); a captura na via REST é papel da PPCONECTA.

## Decisão

- **Autorização é do plugin, por REST** (`POST /1/physicalSales/` + confirmação + desfazimento +
  voids + consultas — documentação oficial do portal Conecta): o backend é a **fonte de verdade
  financeira**, com estado da cobrança, idempotência (`MerchantOrderId` N15 derivado), retry e
  conciliação centralizados — mesmas propriedades dos adapters MP/SumUp/Stone.
- **Captura é do app, pela PPCONECTA** (bridge nativa no Tauri por FFI — §13 do spec): a bridge é
  **capture-only e sem estado de dinheiro** — lê cartão/tabelas EMV e devolve os blobs
  criptografados (`EmvData`, `TrackTwoData`, `PinBlock`, KSN) para o plugin autorizar.
- **A via Client Conecta DLL fica fora do escopo do produto**; o toolkit de IA oficial da Cielo
  para a DLL permanece no workspace apenas como material de referência (`.zcode/skills/cielo-client-conecta/`).

## Justificativa da escolha

- **Fonte de verdade financeira:** com REST, toda transição de estado (autorizar, confirmar,
  desfazer, void) passa pelo plugin — auditoria, conciliação e a máquina de estados
  `ChargeStatus` da camada do adapter valem igual às outras adquirentes. Com a DLL, o app
  autorizaria e o backend só ouviria — quebra o contrato do provider `AbstractPaymentProvider`
  (o Medusa espera capturar/estornar pelo provider) e fragmenta a conciliação.
- **Contrato uniforme entre adapters:** as rotas genéricas do plugin
  (`/admin/pos-payments/charges|terminals|connections`, plano §6.3) e o poll do POS funcionam
  idênticos a MP/SumUp/Stone; a via DLL criaria um quarto fluxo exclusivo.
- **Testabilidade:** a via REST tem **sandbox real com simulação por centavos** para todas as
  operações — a bridge do app pode ser testada contra contrato gravado (MSW) e o fluxo E2E segue
  o protocolo de homologação da Cielo. A DLL só roda com pin pad físico em Windows/Linux.
- **Oficialmente suportada:** a via REST + PPCONECTA é o desenho que o próprio portal documenta
  (página Fluxos da PPCONECTA alimenta diretamente o `physicalSales`); não é um desvio.

## Consequências

**Positivas**
- Plugin mantém o padrão dos demais adapters (mesmo contrato de rotas, mesma máquina de estados).
- Captura e autorização têm fronteiras limpas: app nunca vê dinheiro, backend nunca toca hardware.
- Sandbox por centavos exercita o contrato inteiro sem hardware.

**Negativas / riscos aceitos**
- O app precisa de uma **bridge nativa nova** (FFI à PPCONECTA, Windows/Linux,Abecs) — sub-projeto
  no medusa-pos, com distribuição e versionamento da lib a fechar com a Cielo (spec §14.2).
- A PPCONECTA mantém estado local (tabelas EMV no pin pad) — rotina de verificação/carga
  (`TAB_VER`/`TAB_LOAD` com a Baixa de Parâmetros) entra na inicialização do app.
- Sem a via DLL, não há alternativa se a PPCONECTA não cobrir algum pin pad do parque do lojista —
  mitigação: exigir pin pads homologados (§2 do spec) na qualificação do cliente.

**Compliance (checklist ADR 0001):** via REST no plugin; captura (PPCONECTA) é componente do app e
não entra no pacote npm; idempotência por `MerchantOrderId` derivado;
dinheiro em minor units sem conversão; sem webhook — `getWebhookActionAndData` → `not_supported`.
