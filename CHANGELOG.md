# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-05

### Fixed

- Money: provider agora trata o amount do core como minor units verbatim
  (`assertMinorAmount`) — a conversão anterior multiplicava por 100 e inflava
  a cobrança na adquirente; refund compara o `raw_amount` verbatim com o blob.
- Webhook: `data.id` em lowercase no canonical HMAC (nota oficial da doc de
  notifications) — entregas reais com id maiúsculo eram descartadas.
- Subscriber: aceita o id do provider com e sem o prefixo `pp_` (o core 2.19
  prefixa incondicionalmente ao path param; o 2.21 tolera ambas as formas).

### Added

- Mercado Pago adapter: `mapStatus` — pure order-to-charge-state mapping that is
  `type`-aware (Point vs QR official state machines), with the normative retry
  taxonomy over transaction `status_detail` (`retryable` / `retry_with_change` /
  `not_retryable` / `escalate`) and operator-facing pt-BR reason copy. Fail-closed:
  unknown order status and QR-forbidden states raise `MpContractError`; unknown
  refusal details degrade conservatively with the raw code preserved.
- `CONSTRAINTS.md` — non-negotiable engineering constraints for payment-path
  changes (money/units, charge state transitions, `data_version`, additive
  adapter options, fail-closed, no new declared dependency — runtime, dev,
  peer or optional — without an ADR).
- `CLAUDE.md` now documents the full ADLC development cycle (per-phase commands,
  rails, evidence-ledger discipline), the engineering standards in executable
  summary form, and the verification gates with explicit tool attribution
  (opcore = code hygiene, the-open-engine; ADLC = development lifecycle with
  evidence, voodootikigod) — the repository is self-contained for any
  contributor.
- `MP_POINT_TEST_MODE` guard (mercadopago, T6): charging a sandbox terminal
  (serial prefix `SBX` in the official `{type}__{serial}` format, e.g.
  `NEWLAND_N950__SBX0000001`) fails closed before any network call unless the
  option `mpPointTestMode` is explicitly enabled — on the provider
  (`PosTerminalOptions`) or the plugin `posTerminal` block that feeds the admin
  routes. Enabling is never silent — a loud warning is logged at provider boot
  and, on the admin-route path, once per process on first use — and never
  exempts credentials (presence-gated registration preserved): test mode is
  never silent in production.

### Fixed

- Mercado Pago queue-conflict 409: the test contract now uses the real error
  code `already_queued_order_on_terminal` (was `..._for_...`), per the
  2026-10-04 homologation errata. No production behavior change — the
  idempotency-conflict recovery keys on the `idempotency_key_already_used`
  error code only, so queue-conflict 409s never entered it.

### Changed

- CI: the ADLC step now also runs `adlc gate-manifest verify` (tamper-evidence
  over the append-only evidence ledger) and installs the toolkit with
  `--ignore-scripts`. Workflow comments now attribute the two toolchains
  explicitly: opcore (code hygiene, the-open-engine) is a distinct project from
  the ADLC toolkit (voodootikigod).
- Evidence ledger signing: the ADLC step receives `ADLC_MANIFEST_KEY`
  (repo secret, HMAC) so `gate-manifest verify` attests entry authorship
  instead of internal consistency only. `CLAUDE.md` documents the house
  conventions decided with this change: adversarial review before every push,
  one PR = one nature (feature vs process artifacts), specs as per-ticket
  historical records, and the Phase 1 spec closed as a historical record
  (acceptance criteria checked against the 0.0.1 deployment evidence).

## [0.0.1] - 2026-09-30

First release — Phase 1: manual / terminal-present payments for Brazilian card
terminals (maquininha) on Medusa v2.

### Added

- `pos-terminal` payment provider (ModuleProvider over `Modules.PAYMENT`),
  registered as `pp_pos-terminal_card|pix|cash|transfer` — the cashier confirms
  the charge made on the physical terminal; no acquirer credentials required.
- Hardened session-`data` contract: zod validation at the boundary,
  prototype-pollution rejection (`__proto__`/`constructor`/`prototype`),
  depth-1 merge, full-blob returns (no clobbering), state guards (capture of a
  canceled charge, cancel of a captured charge), `getPaymentStatus` never throws.
- `GET /admin/pos-payments/health` — authenticated health endpoint (core admin
  auth, no custom middleware).
- Plugin factory with a single source of truth for the package name
  (`PLUGIN_NAME`) and `getPluginOptions` via `CONFIG_MODULE`.

### Tests / CI

- 36 tests; 100% statement/branch/function/line coverage; coverage thresholds
  as CI gates (global 90%, money paths 95%).
- CI: build (`medusa plugin:build`), tests with coverage thresholds, strict
  typecheck, ADLC spec gate, opcore, npm audit, Snyk, gitleaks (pinned binary),
  commitlint (Conventional Commits).
- Codecov: upload via pinned action, PR statuses (project 90%, money-paths 95%,
  patch 90%) and badge.

### Release

- Tag-driven publish workflow (`v*` on `main`): tag-must-point-to-`main` guard,
  tag = `package.json` version guard, `--provenance`, explicit dist-tag
  (`next` for prereleases, `latest` for stable).
