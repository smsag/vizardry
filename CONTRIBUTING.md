# Contributing to Vizardry

This file holds the three principles that guide development, the checks that enforce them, and the everyday commands. It came out of a full quality and security review (0.69.0); each principle is stated with the class of bug it exists to prevent, so a reviewer can point at it.

## The three principles

### 1. One implementation per behaviour, and the machine checks it

Every copy of a behaviour is a place for the next fix to be missed. The review found the same logic five to nine times over: nine hand-rolled delete buttons, six "name 2, name 3" loops, five `escRe`, four key-badge builders, three "could not save" notices, three Obsidian shims, and a selector list in one file that had drifted from the class names in twenty others. Each duplicate carried its own variant of the same defect.

So: a behaviour lives in one module and is imported. When something must stay in sync across files, a script asserts it in CI rather than a comment asking for it. Today that is:

- `scripts/css-check.mjs` — every `.vzd-*` class in `styles.css` is referenced from source (dead CSS after a renderer is removed).
- `scripts/docs-check.sh` — the three manifests carry one version; every framework is documented; the LLM cheatsheet stays short.
- `tsconfig.json` with `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` — dead code cannot accumulate silently.
- ESLint `no-floating-promises` on plugin, extension and tests alike.

Adding a framework, a setting or a shim without wiring it into these checks is the review comment to expect.

### 2. Every failure is visible to the person it affects

A silent failure is the most expensive kind: it becomes a bug report weeks later with no trace. The review found writes that returned `false` and left the canvas showing a value the note never received, a `catch {}` that turned a broken keychain into an empty picker, comments dropped from summaries forever with no log line, and a settings save that failed as an unhandled rejection.

So:

- A write-back helper returns `boolean`; the caller shows `t("edit.writeFailed")` or the inline notice when it is `false`. Never discard the result.
- A parser reports recoverable problems through `warnings` on its result, and the renderer calls `renderCanvasWarnings`. `console.warn` alone is not reporting.
- A `catch` either handles the error or logs it with `console.warn`/`console.error` and a `Vizardry:` prefix. An empty catch needs a comment saying why nothing can be done.
- A user-facing failure gets a `Notice` once, not per keystroke (see `saveFailureShown` in `main.ts` for the pattern).
- Errors that callers branch on are typed (`IntegrationAuthError`, `VizardryExportError.code`), never matched by message text.

### 3. Trust nothing that crosses a boundary, and bound every wait

Input from a note, a data.json, a remote API or a browser event is data, not instructions. The review found unsanitised Markdown HTML rendered in the extension, `http://` base URLs accepted with the API key in a header, model ids that 404'd on every request, regexes that backtracked for seconds on a crafted line, and waits with no ceiling (an image that never loads, a 120-second Retry-After).

So:

- HTML from any source goes through `extension/sanitize.ts` or Obsidian's own renderer; never `innerHTML` with non-literal content.
- Settings are coerced by `settings-schema.ts` (the `url` kind insists on https). New settings get a schema entry, not a raw read.
- A regex over user text has no adjacent overlapping quantifiers; a test times the pathological input (`links.test.ts` shows the shape).
- Every network wait has a timeout and every retry a cap and jitter (`request-timeout.ts`, `request-retry.ts`); every DOM wait has a `maxMs`.
- DOM listeners on `document`/`window` are released through `onDisconnected`, and a pointer or touch gesture handles `pointercancel`/`touchcancel`.

## Commands

```
npm run check        # typecheck (plugin + extension), lint, tests, docs-check, css-check
npm run typecheck
npm run lint
npm test
npm run coverage     # thresholds are held just under what the suite achieves
npm run test:visual  # Playwright, in the container named in playwright.config.ts
npm run build && npm run ext:build
npm version minor --no-git-tag-version   # bumps package, plugin and extension manifests together
```

## Before opening a pull request

1. `npm run check` is green.
2. Behaviour changes have a test that fails without the fix.
3. `RELEASE_NOTES.md` has a section for the version this ships in, written for the user who hit the problem.
4. The docs listed in the PR template that the change touches are updated.
