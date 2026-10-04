#!/usr/bin/env bash
# ci:local — paridade de CI em dev (ticket T7). Fonte da verdade: .github/workflows/ci.yml
# Regra de casa: nenhum erro pode ser descoberto pelo CI — todo gate roda aqui antes do push,
# na MESMA ordem do job `verify` + o job `commitlint`. Serviços com secret (Codecov, FOSSA,
# Snyk) são SKIP declarado no fim, nunca falha silenciosa. Qualquer mudança no ci.yml passa
# por aqui no mesmo PR.
# ATENÇÃO: run_stage chama os estágios dentro de `if !` — dentro de função assim o set -e
# fica SUSPENSO. Todo comando que pode falhar precisa de `|| return 1` explícito.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[ -d "$HOME/.volta/bin" ] && export PATH="$HOME/.volta/bin:$PATH"

require_cli() {
  local cli="$1"
  local package="$2"
  local expected="${3:-}"
  if ! command -v "$cli" >/dev/null 2>&1; then
    echo "CLI ausente: instale $package antes de rodar ci:local." >&2
    exit 1
  fi
  # Presença não basta: versão diferente da pinada pelo CI destrói a paridade
  # (um verde local deixa de garantir o verde do CI). Token extraído e
  # comparado por IGUALDADE — substring/regex aceitariam 10.3.3 como 0.3.3.
  if [ -n "$expected" ]; then
    local found_token
    found_token="$("$cli" --version 2>/dev/null | grep -oE "[0-9]+(\.[0-9]+)+([-.][0-9A-Za-z]+)*" | head -1)"
    if [ "$found_token" != "$expected" ]; then
      echo "Versão de $cli diverge do pin do CI (esperado $expected; encontrado ${found_token:-desconhecida})." >&2
      exit 1
    fi
  fi
}
require_cli opcore "@the-open-engine-company/opcore@0.3.3 (npm i -g)" "0.3.3"
require_cli adlc "@adlc/cli@1.11.1 (npm i -g --ignore-scripts)" "1.11.1"
# O CI usa corepack prepare pnpm@9.10.0 (packageManager do repo). Com corepack
# disponível, TODO pnpm daqui passa pelo pin do repo; sem corepack, exige a
# versão exata no PATH.
if command -v corepack >/dev/null 2>&1; then
  pnpm() { command corepack pnpm "$@"; }
  export -f pnpm
else
  require_cli pnpm "pnpm@9.10.0 (corepack enable)" "9.10.0"
fi

SKIPS=()
STAGES_OK=0

run_stage() {
  local name="$1"
  shift
  printf '\n==> [%s]\n' "$name"
  if ! "$@"; then
    printf '\nERRO: estágio "%s" falhou — corrija antes de push.\n' "$name" >&2
    exit 1
  fi
  STAGES_OK=$((STAGES_OK + 1))
}

stage_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "working tree suja — o CI constrói código commitado; commit ou stash antes."
    return 1
  fi
}

stage_adlc() {
  if [ -f .adlc/manifest.jsonl ] && [ ! -f "$HOME/.adlc/manifest.key" ]; then
    echo "ledger .adlc/manifest.jsonl existe sem ~/.adlc/manifest.key — o record gravaria unsigned e o CI quebraria (chain broken)."
    return 1
  fi
  if [ -f "$HOME/.adlc/manifest.key" ]; then
    export ADLC_MANIFEST_KEY="$(cat "$HOME/.adlc/manifest.key")"
  fi
  adlc spec-lint .adlc/specs/fase-1-provider-manual.md || return 1
  adlc gate-manifest verify --json || return 1
}

stage_gitleaks() {
  local version="8.30.1"
  local checksum="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
  # Cache PRIVADO do usuário (/tmp é plantável por outro usuário local — CWE-829);
  # o que fica em cache é o TARBALL — o binário é extraído a cada execução a
  # partir dele, então só roda código cujo checksum bate (CWE-354).
  local cache="${XDG_CACHE_HOME:-$HOME/.cache}/gitleaks"
  local tgz="$cache/gitleaks-$version.tgz"
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) ;;
    *)
      SKIPS+=("gitleaks (plataforma $(uname -s)-$(uname -m) sem binário pinado — rode no CI)")
      return 0
      ;;
  esac
  if [ ! -f "$tgz" ]; then
    mkdir -p "$cache"
    curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz" \
      -o "$tgz" || return 1
  fi
  echo "${checksum}  $tgz" | sha256sum -c - >/dev/null || {
    rm -f "$tgz"
    echo "checksum do tarball do gitleaks não bateu — cache descartado, rode de novo para baixar limpo." >&2
    return 1
  }
  local rundir
  rundir="$(mktemp -d)"
  local status=0
  tar -xzf "$tgz" -C "$rundir" gitleaks || {
    rm -rf "$rundir"
    return 1
  }
  # PRESERVA o status do scanner: gitleaks exit 1 = VAZAMENTO encontrado —
  # o cleanup depois dele não pode mascarar o gate (provado na r4 da revisão).
  "$rundir/gitleaks" detect --source . --no-banner --redact -v || status=$?
  rm -rf "$rundir"
  return "$status"
}

stage_commitlint() {
  local branch
  branch="$(git branch --show-current)"
  case "$branch" in
    develop | main | "")
      SKIPS+=("commitlint (branch $branch — job é só de PR)")
      return 0
      ;;
  esac
  local base="${CI_LOCAL_BASE:-origin/develop}"
  # set -e fica suspenso dentro de função chamada por `if` — substituição de
  # comando quebrada silenciava o range e o commitlint validava outra coisa
  # (provado por mutation). Checagem explícita em cada passo que pode falhar.
  if [[ "$base" == origin/* ]]; then
    if ! git fetch origin "${base#origin/}" --quiet; then
      echo "git fetch ${base} falhou — commitlint exige a base atualizada (offline: aponte CI_LOCAL_BASE para um ref local)." >&2
      return 1
    fi
  fi
  local from
  if ! from="$(git merge-base "$base" HEAD 2>/dev/null)"; then
    echo "merge-base falhou para $base — ref inexistente? Confira CI_LOCAL_BASE." >&2
    return 1
  fi
  printf 'validando %s..HEAD (%s)\n' "$from" "$branch"
  npx --yes -p @commitlint/cli@21 -p @commitlint/config-conventional@21 \
    commitlint --from "$from" --to HEAD
}

printf 'ci:local — paridade do .github/workflows/ci.yml (base: %s)\n' "${CI_LOCAL_BASE:-origin/develop}"

run_stage "0 árvore limpa" stage_tree
run_stage "1 install (frozen)" pnpm install --frozen-lockfile
run_stage "2 lint + formato" bash -c 'pnpm lint && pnpm format:check'
run_stage "3 build (medusa plugin:build)" bash -c 'cd plugins/pos-payments && pnpm exec medusa plugin:build'
run_stage "4 testes + cobertura (90/95)" bash -c 'cd plugins/pos-payments && pnpm test:coverage'
run_stage "5 typecheck (tsc --noEmit)" bash -c 'cd plugins/pos-payments && pnpm exec tsc --noEmit'
run_stage "6 knip" pnpm knip
run_stage "7 opcore" bash -c 'OPCORE_NO_HOOKS=1 opcore check --repo . --all'
run_stage "8 adlc (spec-lint + manifest)" stage_adlc
run_stage "9 npm audit (prod, high)" pnpm audit --prod --audit-level high
run_stage "10 gitleaks" stage_gitleaks
run_stage "11 commitlint (range da branch)" stage_commitlint

printf '\nCI LOCAL: %s/12 estágios verdes.\n' "$STAGES_OK"
if [ "${#SKIPS[@]}" -gt 0 ]; then
  printf 'SKIP declarado:\n'
  printf '  - %s\n' "${SKIPS[@]}"
fi
printf 'Serviços com secret sempre fora daqui: Codecov (upload), FOSSA (licenças), Snyk (SAST/deps).\n'
