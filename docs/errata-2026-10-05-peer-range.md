# Errata 2026-10-05 — peer range do plugin (`>=2.19.0 <3`)

Documento de errata **externo aos ADRs** (rails imutáveis — `docs/adr/**` é
congelado pelo rails-guard): registra a mudança de faixa de peer dependencies
sem editar os registros históricos. Erratas de ADR vivem em `docs/`.

## O que mudou

- `plugins/pos-payments/package.json`: peerDependencies de
  **`>=2.15.0 <3`** para **`>=2.19.0 <3`** (framework, medusa, utils), no PR #56.
- Versão do pacote: **`0.0.1` → `0.1.0`** — drop de minor em `0.x` entra em
  MINOR (ADR 0006 §4/§5, semver §4).

## Onde os ADRs dizem o valor antigo (imutáveis — corrigidos por esta errata)

- **ADR 0002** (estrutura e convenções): a seção de dependências e a seção de
  publicação citam `>=2.15 <3` — leia-se, desde esta errata, `>=2.19.0 <3`.
- **ADR 0006 §5** (compatibilidade Medusa = política de versão): cita
  `>=2.15 <3` — idem.

## Base de verificação [ok]

- Runtime **2.19.0** verificado no dist instalado (createPaymentSession,
  refundPaymentFromProvider_, roteamento do webhook).
- Referência **2.21.1** verificada no fonte do monorepo: única divergência
  funcional relevante para providers custom é a tolerância do prefixo `pp_` no
  roteamento do webhook (o 2.19 prefixa incondicionalmente; o 2.21 aceita o
  path param já prefixado) — coberta pelo subscriber do plugin.
- Faixa **2.15–2.18 nunca foi verificada** — motivo do estreitamento.
