#!/usr/bin/env bash
# docs-check.sh — Catch documentation drift on every CI run.
#
# Checks objective facts that can be verified mechanically:
#   1. manifest.json version matches package.json version
#   2. manifest.json version has an entry in versions.json
#   3. README.md mentions every framework (by ID)
#
# Local docs (docs/, AGENTS.md) are gitignored and cannot be checked here.
# The Claude Code Stop/PreCompact hooks cover those.
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

# Non-grid (custom renderer) IDs
for id in impact story mindmap venn sipoc wardley carousel; do
  grep -qi "\b${id}\b" README.md || MISSING+=("$id")
done

if [ ${#MISSING[@]} -eq 0 ]; then
  ok "README.md mentions all framework IDs"
else
  fail "README.md is missing mention of: ${MISSING[*]}"
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
