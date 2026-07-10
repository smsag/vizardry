## Features
- New "Upvoty dashboard URL" setting so the "Open in Upvoty" link works for self-hosted/white-labelled Upvoty instances instead of a hardcoded domain.

## Fixes
- Wardley Map: the last evolution stage now reaches the right edge of the plot instead of stopping short at the last configured position.
- Wardley Map: drag and link-draw gestures now clean up their listeners if the canvas re-renders mid-gesture, instead of leaking and later writing against a detached element.
- Settings: re-linking a Linear/Upvoty secret no longer duplicates its label and status badge.
- LLM requests (Anthropic/OpenAI) now surface real error statuses (401/429/500) instead of a generic "network error".
- Linear/Upvoty caches are now cleared when you change the linked secret or base URL, so another workspace's/board's stale cached data can no longer bleed through under a reused issue key.
- External requests (Linear, Upvoty, LLM) now time out instead of hanging forever, and retry with backoff on HTTP 429.
- Inline editing now targets the pane you're actually looking at when the same note is open in multiple splits.
- Fishbone, Impact Map, Mind Map, OST, and SCQA node rename/add/delete now detect ambiguous same-named nodes and refuse (with a warning) instead of silently editing the wrong one. Mind Map also gained duplicate-name detection it previously lacked entirely.
- Linear and Upvoty popovers now share one stacking order, so they no longer stack unpredictably against each other.
- Text-contrast calculation now understands `rgba()` and CSS Color 4 `color-mix()` output, not just literal `rgb(r, g, b)`.
- A duplicate `block:` or `type:` line in a framework source now produces a clear error instead of silently losing data or a confusing downstream failure.
- Fixed several listener/timer leaks: canvas title rename, plugin unload, and per-enriched-key DOM observers (now shared instead of one per key).

## Internal
- Consolidated the Fishbone/Impact Map/Mind Map/OST/SCQA tree-editing logic into two shared, config-driven engines, removing roughly 1000 lines of duplicated code.
- Consolidated Linear/Upvoty key-enrichment popovers into a shared module.
- Extracted shared two-pass card-mode rendering used by the canvas and matrix views.
- Split `pacelayers-edit.ts`'s large cell-write function into named steps.
- Added test coverage for previously-untested code paths (Linear cache, matrix rendering, lifecycle/disconnect handling, request retry/timeout helpers, and the new tree-edit engines).
