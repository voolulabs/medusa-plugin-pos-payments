# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

- CI: the ADLC step now also runs `adlc gate-manifest verify` (tamper-evidence
  over the append-only evidence ledger) and installs the toolkit with
  `--ignore-scripts`. Workflow comments now attribute the two toolchains
  explicitly: opcore (code hygiene, the-open-engine) is a distinct project from
  the ADLC toolkit (voodootikigod).

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
