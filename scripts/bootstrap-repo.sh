#!/usr/bin/env bash
# bootstrap-repo.sh — bring any repo up to the Vizardry infrastructure standard.
#
# USAGE
#   Run from inside the target repo directory:
#     bash bootstrap-repo.sh
#     bash bootstrap-repo.sh owner/repo   # if git remote not yet configured
#
# WHAT IT DOES
#   1. GitHub settings  — branch protection (CI required), no force-push,
#                          auto-delete merged branches
#   2. CI workflow      — .github/workflows/ci.yml (type-check → lint → test →
#                          docs-check → build)
#   3. docs-check.sh    — version sync + README coverage script
#   4. Claude hooks     — .claude/settings.json (Stop + PreCompact doc reminders)
#   5. docs/ scaffold   — empty template files for all six doc types
#   6. AGENTS.md        — engineering-review rules + placeholders for this repo
#
# PREREQUISITES
#   gh   — GitHub CLI, authenticated (gh auth login)
#   jq   — JSON processor
#   bash — 4+ (macOS ships bash 3; use Homebrew bash if needed)
#
# All templates are embedded — the script is fully self-contained.
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${RESET}"; }
skip() { echo -e "${YELLOW}⏭   $* (already exists — skipped)${RESET}"; }
info() { echo -e "    $*"; }
fail() { echo -e "${RED}❌  $*${RESET}"; exit 1; }

# ── Resolve repo slug ──────────────────────────────────────────────────────────
if [ "${1:-}" != "" ]; then
  REPO="$1"
else
  # Infer from git remote
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
  if [ -z "$REMOTE_URL" ]; then
    fail "Cannot infer repo — pass owner/repo as argument or set a git remote origin"
  fi
  # Handle both https://github.com/owner/repo and git@github.com:owner/repo
  REPO=$(echo "$REMOTE_URL" \
    | sed 's|https://github.com/||' \
    | sed 's|git@github.com:||' \
    | sed 's|\.git$||')
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bootstrapping: $REPO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. GitHub settings ─────────────────────────────────────────────────────────
echo "── GitHub settings ───────────────────────"

# Auto-delete merged branches
gh api "repos/$REPO" --method PATCH \
  --field delete_branch_on_merge=true \
  -q '.full_name' > /dev/null
ok "Auto-delete merged branches enabled"

# Branch protection on main: require CI, block force-push + deletion
gh api "repos/$REPO/branches/main/protection" \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'JSON' > /dev/null
{
  "required_status_checks": { "strict": false, "contexts": ["ci"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
ok "Branch protection: CI required, force-push + deletion blocked"

echo ""

# ── 2. CI workflow ─────────────────────────────────────────────────────────────
echo "── CI workflow ───────────────────────────"
mkdir -p .github/workflows

if [ -f .github/workflows/ci.yml ]; then
  skip ".github/workflows/ci.yml"
else
  cat > .github/workflows/ci.yml << 'YAML'
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Type-check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Docs check
        run: bash scripts/docs-check.sh

      - name: Build
        run: npm run build
YAML
  ok ".github/workflows/ci.yml created"
  info "⚠  Adjust the CI steps to match this repo's scripts"
fi

echo ""

# ── 3. docs-check.sh ──────────────────────────────────────────────────────────
echo "── scripts/docs-check.sh ─────────────────"
mkdir -p scripts

if [ -f scripts/docs-check.sh ]; then
  skip "scripts/docs-check.sh"
else
  cat > scripts/docs-check.sh << 'BASH'
#!/usr/bin/env bash
# docs-check.sh — catch documentation drift on every CI run.
#
# Checks objective facts that can be verified mechanically:
#   1. manifest.json version matches package.json version
#   2. manifest.json version has an entry in versions.json
#   3. README.md mentions every key file/module (customise the list below)
#   4. (recommended) any public reference doc under docs/ that ships with the
#      product covers every framework/feature it documents — so a release can't
#      go out with an undocumented one. This runs inside the release gate.
set -euo pipefail

ERRORS=0
fail() { echo "❌  $*"; ERRORS=$((ERRORS + 1)); }
ok()   { echo "✅  $*"; }

# ── 1. Version sync ────────────────────────────────────────────────────────
MV=$(jq -r '.version' manifest.json)
PV=$(jq -r '.version' package.json)
[ "$MV" = "$PV" ] \
  && ok "Version sync: both at v$MV" \
  || fail "Version mismatch — manifest.json=$MV, package.json=$PV"

# ── 2. versions.json coverage ─────────────────────────────────────────────
if [ -f versions.json ]; then
  jq -e --arg v "$MV" 'has($v)' versions.json > /dev/null 2>&1 \
    && ok "versions.json covers v$MV" \
    || fail "versions.json missing entry for v$MV"
fi

# ── 3. README mentions key identifiers ────────────────────────────────────
# TODO: replace with identifiers meaningful for THIS repo
# Example for an Obsidian plugin with src/frameworks/*.ts files:
#   for f in src/frameworks/*.ts; do
#     id=$(basename "$f" .ts)
#     grep -qi "\b${id}\b" README.md || MISSING+=("$id")
#   done
MISSING=()
# MISSING checks go here

[ ${#MISSING[@]} -eq 0 ] \
  && ok "README.md coverage check passed" \
  || fail "README.md missing: ${MISSING[*]}"

echo ""
[ "$ERRORS" -eq 0 ] && echo "All docs checks passed." && exit 0
echo "$ERRORS check(s) failed." && exit 1
BASH
  chmod +x scripts/docs-check.sh
  ok "scripts/docs-check.sh created"
  info "⚠  Edit the TODO section to add repo-specific README coverage checks"
fi

echo ""

# ── 4. Claude Code hooks ──────────────────────────────────────────────────────
echo "── .claude/settings.json ─────────────────"
mkdir -p .claude

if [ -f .claude/settings.json ] && [ "$(cat .claude/settings.json)" != "{}" ]; then
  skip ".claude/settings.json (non-empty, not overwriting)"
else
  cat > .claude/settings.json << 'JSON'
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"systemMessage\": \"📝 Session ending — confirm all relevant docs are current before closing:\\n• README.md — any user-facing feature or behaviour change?\\n• docs/SPEC.md — version history, features, roadmap?\\n• docs/ARCHITECTURE.md — new modules, data flow changes?\\n• docs/DECISIONS.md — new ADRs for architectural or design choices?\\n• docs/ENGINEERING-REVIEW.md — new issues found or items resolved?\\n• AGENTS.md — project structure, new utilities, workflow changes?\"}'",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"systemMessage\": \"⚠️ Context about to be compressed — once compacted the full session history is gone. Confirm all docs are current before proceeding: README.md, docs/SPEC.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/ENGINEERING-REVIEW.md, AGENTS.md.\"}'",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
JSON
  ok ".claude/settings.json created (Stop + PreCompact hooks)"
  info "Note: .claude/ should be gitignored — this file stays local"
fi

echo ""

# ── 5. docs/ scaffold ─────────────────────────────────────────────────────────
echo "── docs/ scaffold ────────────────────────"
mkdir -p docs

# Helper: create a doc file only if it doesn't exist
create_doc() {
  local file="$1"; shift
  if [ -f "$file" ]; then
    skip "$file"
  else
    cat > "$file"
    ok "$file created"
  fi
}

create_doc docs/SPEC.md << 'MD'
# PROJECT_NAME — Product Specification

## Vision

<!-- One paragraph: what problem does this solve, for whom, why it matters. -->

---

## Users

**Primary**: <!-- Who uses this? -->
**Secondary**: <!-- Who else benefits? -->

---

## Features

<!-- List of features with brief descriptions. -->

---

## Non-goals

<!-- What this explicitly does not do. -->

---

## Constraints

<!-- Technical, legal, operational constraints. -->

---

## Version history

| Version | Features |
|---|---|
| 0.1.0 | Initial release |

---

## Roadmap

| Feature | Notes |
|---|---|
| <!-- next feature --> | <!-- context --> |
MD

create_doc docs/ARCHITECTURE.md << 'MD'
# PROJECT_NAME — Architecture

## Overview

<!-- One paragraph describing the high-level structure. -->

---

## Module responsibilities

<!-- One section per major module/file. -->

### `src/main.ts`
<!-- Entry point. What does it own? -->

---

## Data flow

<!-- Describe the main data flow with a text diagram or list. -->

---

## Extension points

<!-- How does someone add a new X? -->

---

## Test suite

<!-- What's tested, how to run, what environment is needed. -->
MD

create_doc docs/DECISIONS.md << 'MD'
# PROJECT_NAME — Decision Log

Architectural, product, and design decisions with context and rejected alternatives.
Most recent first within each section.

---

## Architecture

### ADR-001 — <!-- Decision title --> (YYYY-MM)
**Decision:** <!-- What was decided. -->
**Rejected:** <!-- What alternatives were considered and why they were rejected. -->
**Consequence:** <!-- What this means for the codebase going forward. -->

---

## Product

---

## Design
MD

create_doc docs/ENGINEERING-REVIEW.md << 'MD'
# PROJECT_NAME — Engineering Review

Senior-engineer analysis. Covers file inventory, test coverage, and improvement suggestions ranked by impact.

---

## File inventory (sorted by line count)

<!-- Run: find src -name "*.ts" | xargs wc -l | sort -rn | head -30 -->

---

## Improvement Suggestions

| # | Title | Category | Effort | Status |
|---|-------|----------|--------|--------|
| 1 | <!-- first item --> | <!-- Reliability / Maintainability / Performance / etc --> | <!-- Tiny / Small / Medium --> | Open |

MD

create_doc docs/DESIGN.md << 'MD'
# PROJECT_NAME — Design System

## Principles

<!-- 3–5 design principles. -->

---

## Visual decisions

<!-- Document key visual/UX decisions here. -->
MD

echo ""

# ── 6. AGENTS.md ──────────────────────────────────────────────────────────────
echo "── AGENTS.md ─────────────────────────────"

REPO_NAME=$(basename "$REPO")

if [ -f AGENTS.md ]; then
  skip "AGENTS.md"
else
  cat > AGENTS.md << AGENTSMD
# ${REPO_NAME} — Agent Instructions

<!-- One sentence: what this repo is and what it does. -->

---

## Keeping docs current

These local files are the context store for new sessions. Update the relevant ones **before opening a PR**. They are gitignored (single-developer workflow) so they are never committed, but must be kept current locally.

| File | Update when |
|---|---|
| \`AGENTS.md\` | File structure changes, new workflows, new invariants |
| \`docs/SPEC.md\` | Feature added/changed, syntax changed, version history |
| \`docs/ARCHITECTURE.md\` | New module, data flow change, new file added |
| \`docs/DESIGN.md\` | New CSS classes/prefixes, visual decisions |
| \`docs/DECISIONS.md\` | Any significant architectural, product, or design decision |
| \`docs/ENGINEERING-REVIEW.md\` | Any bug found, improvement made, or review item resolved |
| \`docs/vizardry-canvas-syntax-reference.md\` | **Public, committed** — a framework is added or a \`type:\`/keyword changes (CI's docs-check enforces framework coverage; a release cannot ship without it) |
| \`README.md\` | Any user-facing behaviour change |

### Engineering review rules (mandatory)

These three rules apply to every session that touches the codebase:

1. **Every implementation must update all relevant docs.** After any code change, scan all files in \`docs/\` and update every document that is affected. Do not open a PR without docs being current.

2. **Every bug, flaw, or improvement discovered must be recorded in \`docs/ENGINEERING-REVIEW.md\`.** Add it immediately — even if you don't fix it. Include category, effort estimate, and description.

3. **Every engineering-review item that gets fixed must be marked resolved before the PR is opened.** Update status to \`✅ Fixed <date>\`, add a Resolution paragraph, update the summary table.

### What to update for common tasks

**New framework / syntax change** → \`docs/vizardry-canvas-syntax-reference.md\` (add the framework's \`type:\`, keywords, and a copy-paste example), \`README.md\`, \`docs/SPEC.md\`, \`docs/ARCHITECTURE.md\` (if new module). docs-check fails CI until the reference covers it.

**Bug fix** → \`docs/ENGINEERING-REVIEW.md\` (mark resolved or add new item)

**Architectural decision** → \`docs/DECISIONS.md\` (always, even small ones)

**Release** → confirm \`docs/vizardry-canvas-syntax-reference.md\` is current, update \`docs/SPEC.md\` (version history) + \`RELEASE_NOTES.md\`, bump \`manifest.json\` + \`package.json\` + \`versions.json\`

---

## Dev setup

\`\`\`bash
npm install
npm run dev        # watch mode
npm run build      # production build
npm test           # run tests
npm run coverage   # run tests + coverage report
npm run lint       # ESLint
\`\`\`

---

## Project structure

\`\`\`
<!-- TODO: fill in the project structure -->
src/
  main.ts          Entry point
\`\`\`

---

## Key invariants

<!-- TODO: list things that must never be violated -->

---

## Release process

1. Confirm \`docs/vizardry-canvas-syntax-reference.md\` is current for any framework/syntax change (docs-check gates this in CI).
2. Bump version: \`npm version <patch|minor|major> --no-git-tag-version\` (syncs \`manifest.json\` + \`versions.json\` via \`version-bump.mjs\`).
3. Update \`RELEASE_NOTES.md\` (the body the release workflow publishes).
4. Commit + push → PR → merge to \`main\` (CI runs verify.yml: tsc, lint, test, docs-check, build).
5. Dispatch the release workflow on \`main\` with the new version (\`.github/workflows/release.yml\` re-runs verify, checks the tag matches \`manifest.json\`, builds, and creates the GitHub release with \`main.js\` + \`manifest.json\` + \`styles.css\`). Client-side tag pushes are blocked by org policy — always release via the workflow dispatch.
AGENTSMD
  ok "AGENTS.md created"
  info "⚠  Fill in the project description, structure, and invariants"
fi

echo ""

# ── .gitignore additions ──────────────────────────────────────────────────────
echo "── .gitignore ────────────────────────────"

if [ -f .gitignore ]; then
  GITIGNORE_UPDATED=0
  for entry in "AGENTS.md" "docs/" ".claude/"; do
    if ! grep -qF "$entry" .gitignore; then
      echo "$entry" >> .gitignore
      GITIGNORE_UPDATED=1
    fi
  done
  [ $GITIGNORE_UPDATED -eq 1 ] && ok ".gitignore updated (AGENTS.md, docs/, .claude/)" \
                                 || skip ".gitignore (entries already present)"
else
  printf "AGENTS.md\ndocs/\n.claude/\n" > .gitignore
  ok ".gitignore created"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bootstrap complete for $REPO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Edit AGENTS.md — fill in project description, structure, invariants"
echo "  2. Edit scripts/docs-check.sh — add repo-specific README coverage checks"
echo "  3. Edit .github/workflows/ci.yml — adjust steps for this repo's tooling"
echo "  4. Ask Claude to analyse the codebase and fill in docs/ARCHITECTURE.md,"
echo "     docs/SPEC.md, docs/DECISIONS.md, and docs/ENGINEERING-REVIEW.md"
echo ""
