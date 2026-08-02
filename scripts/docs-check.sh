#!/usr/bin/env bash
# docs-check.sh — Catch documentation drift on every CI run.
#
# Checks objective facts that can be verified mechanically:
#   1. manifest.json version matches package.json version
#   2. manifest.json version has an entry in versions.json
#   3. README.md mentions every framework (by ID)
#   4. docs/vizardry-canvas-syntax-reference.md documents every framework type:
#
# The syntax reference is the ONE public doc under docs/ (the rest of docs/ and
# AGENTS.md are gitignored internal docs, covered by the Claude Code hooks).
# It ships with the plugin and is used to generate canvases (incl. via LLMs),
# so a new framework must not merge/release without being documented there —
# this runs inside verify.yml, which both CI and release.yml use as a gate.
set -euo pipefail

ERRORS=0
fail() { echo "❌  $*"; ERRORS=$((ERRORS + 1)); }
ok()   { echo "✅  $*"; }

# ── 1. Version sync ──────────────────────────────────────────────────────────

MV=$(jq -r '.version' manifest.json)
PV=$(jq -r '.version' package.json)

if [ "$MV" = "$PV" ]; then
  ok "Version sync: manifest.json and package.json both at v$MV"
else
  fail "Version mismatch — manifest.json=$MV, package.json=$PV"
fi

# ── 2. versions.json coverage ────────────────────────────────────────────────

if jq -e --arg v "$MV" 'has($v)' versions.json > /dev/null 2>&1; then
  ok "versions.json has an entry for v$MV"
else
  fail "versions.json is missing an entry for v$MV — add it before releasing"
fi

# ── 3. README.md covers all frameworks ──────────────────────────────────────

MISSING=()

# Grid framework IDs derived from src/frameworks/*.ts filenames
for f in src/frameworks/*.ts; do
  id=$(basename "$f" .ts)
  grep -qi "\b${id}\b" README.md || MISSING+=("$id")
done

# Non-grid (custom renderer + extra) IDs derived from processors.ts — no manual list to maintain
while IFS= read -r id; do
  [ -z "$id" ] && continue
  grep -qi "\b${id}\b" README.md || MISSING+=("$id")
done < <(grep -E '^\s+id: "[a-z-]+"' src/processors.ts | grep -oE '"[a-z-]+"' | tr -d '"')

if [ ${#MISSING[@]} -eq 0 ]; then
  ok "README.md mentions all framework IDs"
else
  fail "README.md is missing mention of: ${MISSING[*]}"
fi

# ── 4. Syntax reference covers all frameworks ────────────────────────────────

REF="docs/vizardry-canvas-syntax-reference.md"

if [ ! -f "$REF" ]; then
  fail "$REF is missing — the public canvas syntax reference must be committed"
else
  REF_MISSING=()

  # Grid framework IDs (each src/frameworks/*.ts filename is a type: value)
  for f in src/frameworks/*.ts; do
    id=$(basename "$f" .ts)
    grep -qi "\b${id}\b" "$REF" || REF_MISSING+=("$id")
  done

  # Custom-renderer type: IDs from processors.ts. Hyphenated IDs
  # (opportunity-matrix, sipoc-flow, service-blueprint, …) are insert-command /
  # template aliases, not type: values — they surface in the reference as
  # "matrix, opportunity" etc., so skip them here.
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    case "$id" in *-*) continue ;; esac
    grep -qi "\b${id}\b" "$REF" || REF_MISSING+=("$id")
  done < <(grep -E '^\s+id: "[a-z-]+"' src/processors.ts | grep -oE '"[a-z-]+"' | tr -d '"')

  if [ ${#REF_MISSING[@]} -eq 0 ]; then
    ok "$REF documents all framework type: IDs"
  else
    fail "$REF is missing mention of: ${REF_MISSING[*]} — update the syntax reference"
  fi
fi

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "All docs checks passed."
  exit 0
else
  echo "$ERRORS check(s) failed."
  exit 1
fi
