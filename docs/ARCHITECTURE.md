# Vizardry — Architecture

## Overview

The plugin follows a **parse → render** pipeline with an optional **edit → write-back** path for grid canvases in Live Preview. There is no reactive framework, no external state store, and no server. Every canvas is rendered fresh from the source code block; write-back surgically patches only the changed lines.

```
Code block source (string)
        │
        ▼
   Parser (per-framework)
        │
        ├── { ok: false, error }  ──▶  renderError()
        │
        └── { ok: true, data, links }
                    │
                    ▼
             Renderer (per-framework)
                    │
                    ├── renderCanvas()        — grid frameworks
                    ├── renderImpactMap()     — Impact Map tree
                    ├── renderStoryMap()      — User Story Map
                    ├── renderMindMap()       — Mind Map tree
                    ├── renderOST()           — Opportunity Solution Tree
                    ├── renderVennDiagram()   — Venn Diagram SVG
                    ├── renderSIPOC()         — SIPOC table
                    ├── renderSIPOCFlow()     — SIPOC Flow SVG
                    ├── renderWardleyMap()    — Wardley Map SVG
                    └── renderCarouselBlock() — Image Carousel

                    │ (grid canvases only, when app + ctx available)
                    ▼
          User clicks a block body
                    │
                    ▼
          activateBlockEdit()  — inline textarea
                    │
                    └── on blur / Enter
                              │
                              ▼
                    writeBlockContent()  — surgical line-range patch
                    (src/shared/block-edit.ts)

                    │ (User Story Map, when app + ctx available)
                    ▼
          Double-click / click / drag interactions
                    │
                    ├── addStoryTask()           — + button
                    ├── writeStoryMeta()         — user/goal badge click
                    ├── renameStoryActivity/Step/Task() — dblclick rename
                    ├── moveStoryTaskSlice()     — drag across slice bands
                    ├── reorderStoryTask()       — drag within slice
                    └── moveStoryTaskCrossColumn() — drag to different column
                    (src/shared/story-edit.ts)

                    │ (grid canvases — heading link live update)
                    ▼
          metadataCache.on('changed')  ──▶  triggerRelink(file.path)
                    │
                    ▼
          relinkCanvas()  — update link buttons without full re-render
          (src/renderer/canvas.ts)
```

---

## Module responsibilities

### `main.ts`
Entry point. Owns:
- Plugin lifecycle (`onload`, `onunload`)
- `ALL_FRAMEWORKS` array — grid framework registry
- `CUSTOM_RENDERERS` array — non-grid renderer registry
- Registering all `MarkdownCodeBlockProcessor` handlers
- Registering commands (insert modal + one per framework)
- Ribbon icon
- Constructing the `navigateTo` callback (closes over `app` and `ctx.sourcePath`)
- Passing `app` and `ctx` to `renderCanvas()` to enable inline editing
- Registering a `metadataCache.on('changed')` event listener that calls `triggerRelink(file.path)` to update link buttons on all canvas blocks belonging to that file

`main.ts` is the only file that imports from `obsidian` for API-level operations (workspace, commands, ribbon, events). All renderers are DOM-only.

### `types.ts`
Shared type definitions. No logic. Key types:

- `FrameworkDefinition` — describes a grid framework (id, label, description, blocks, grid CSS values)
- `BlockDefinition` — one block within a framework (label, CSS grid area)
- `Result<T>` — generic discriminated union: `{ ok: true; data: T } | { ok: false; error: string }`. Used by all dedicated parsers via named aliases (`ImpactMapResult`, `StoryMapResult`, etc.)
- `ParseResult` — standalone flat union for the grid parser: `{ ok: true; data: Record<string,string>; links: Record<string,string> } | { ok: false; error: string }`. Has two sibling payload fields so it does not fit `Result<T>` cleanly.
- `ImpactMap`, `ImpactActor`, `ImpactItem` — Impact Map tree types
- `StoryMap`, `StoryActivity`, `StoryStep`, `StoryTask`, `StorySlice` — Story Map types
- `MindMapNode` — recursive mind map node
- `OSTNode` (split into `OSTOutcomeNode`, `OSTOpportunityNode`, `OSTSolutionNode`, `OSTExperimentNode`) — OST tree types
- `VennData`, `VennCircle` — Venn Diagram types
- `SIPOCData`, `SIPOCRow` — row-wise SIPOC types
- `SIPOCFlowData`, `SIPOCFlowNode`, `SIPOCFlowLink`, `SIPOCNodeShape`, `SIPOCColumn` — SIPOC Flow types
- `WardleyMap`, `WardleyComponent`, `WardleyLink` — Wardley Map types
   - `WardleyMap.stages?` stores optional custom x-axis stage labels parsed from `stages:`
   - `WardleyMap.stagePositions?` stores optional normalized x-axis positions aligned to `stages`

### `parser.ts`
Parses the flat `key: value` / block scalar syntax used by all grid frameworks. Handles:
- Simple `key: value` pairs
- YAML-style block scalars (`key: |` + indented lines)
- Comments (`//`) and blank lines

Returns `ParseResult`. Never throws.

### Grid framework parsers
Grid canvases use `parser.ts` directly. The parser returns `data` (a `Record<string, string>` keyed by lowercased block label) and `links` (always `{}` — `_links:` section was removed; heading links are resolved exclusively via `shared/links.ts`).

### Dedicated parsers (non-grid)
Each non-grid framework has its own parser file:

| File | Framework | Syntax style |
|---|---|---|
| `impact.ts` | Impact Map | Indented keyword tree (`goal/actor/impact/deliverable`) |
| `story.ts` | User Story Map | Indented keyword tree (`activity/step/task/slice`) |
| `mindmap.ts` | Mind Map | `root:` + free indentation |
| `frameworks/ost.ts` | Opportunity Solution Tree | `outcome:` + free indentation |
| `venn.ts` | Venn Diagram | `circle/intersection/center` sections |
| `sipoc.ts` | SIPOC Diagram | `row:` blocks with five sub-keys |
| `sipoc-flow.ts` | SIPOC Flow | Column sections + `link: A -> B` directives |
| `wardley.ts` | Wardley Map | `stages/anchor/component/link` DSL with `[vis, evo]` coords |
| `carousel.ts` | Image Carousel | Markdown image syntax, one per line |

All parsers return the same `{ ok, data/error }` discriminated union pattern.

### `renderer.ts`
Re-export hub — aggregates all render functions from `renderer/` for a single import point in `main.ts`.

### `renderer/canvas.ts`
Grid framework renderer and relink registry. Responsibilities:
- `renderCanvas()` — builds the CSS grid, block headers, link buttons; delegates to `block-editor.ts` and `grid-carousel.ts`
- `registerCanvasRelink(sourcePath, fn, watchEl)` — registers a heading-relink callback for a source file; auto-removes when `watchEl` disconnects from the DOM
- `triggerRelink(filePath)` — fires all registered relink callbacks for a file path; called by the `metadataCache` listener in `main.ts`
- `relinkCanvas(container, framework, resolver, navigateTo)` — updates only the link buttons in a rendered canvas without a full re-render; removes stale buttons and adds fresh ones based on a new resolver

### `renderer/block-editor.ts`
`renderBlockBody` + `activateBlockEdit` — inline editing (textarea, commit/discard, write-back).

### `renderer/grid-carousel.ts`
`setupMobileCarousel` — prev/next buttons, dot indicators, touch/swipe handlers, MediaQueryList.

### `renderer/controls.ts`
Shared canvas header. Injected into every canvas via `initCanvas()`. Provides:
- Canvas title and framework label
- Font size increase/decrease buttons
- PNG download button (via `html-to-image`)
- Presentation mode button
- Presentation overlay (fullscreen clone of the canvas DOM)

The presentation selector string must list every canvas wrapper class so all framework types are captured.

### `renderer/tree.ts` + `renderer/tree-canvases.ts`
Generic SVG tree renderer used by OST, Impact Map, and Mind Map. `tree-canvases.ts` adapts each framework's domain types to the generic `TreeNode` interface before passing to `tree.ts`.

### `renderer/sipoc-flow.ts`
SVG flow renderer. Renders five colour-coded column headers, shaped nodes (`rect`, `ellipse`, `parallelogram`), and cubic-bezier directed links with arrowhead markers. Layout is calculated from column position and node index.

### `renderer/wardley.ts`
SVG map renderer. Draws evolution-stage bands, a Y-axis (visibility), and X-axis labels. Stage labels come from `WardleyMap.stages` when present; otherwise the renderer falls back to i18n defaults (Genesis/Custom/Product/Commodity). When `WardleyMap.stagePositions` is present and aligned to `stages`, those positions define the stage boundaries and labels render centered within each interval; otherwise labels are distributed evenly. Components are plotted as circles (anchors filled); labels are offset by quadrant to reduce overlap. Links are shortened cubic-bezier lines with arrowheads.

### `frameworks/*.ts`
Pure data — one `FrameworkDefinition` object per file. No logic. Added to `ALL_FRAMEWORKS` in `main.ts`.

Current grid definition modules include `adkar.ts`, `bmc.ts`, `fourls.ts`, `jobs.ts`, `kata.ts`, `lean.ts`, `leanux.ts`, `opportunity.ts`, `rac.ts`, `swot.ts`, and `vpc.ts`.

### `templates.ts`
Template strings used by insert commands. `generateCanvasTemplate()` auto-generates from a `FrameworkDefinition`. Non-grid templates are hardcoded constants.

### `modal.ts`
`CanvasInsertModal` extends Obsidian's `SuggestModal<FrameworkOption>`. Fuzzy-searches all frameworks by label and description, renders the framework label and code block tag, inserts the template on selection.

### `shared/block-edit.ts`
`writeBlockContent(app, ctx, container, blockLabel, newValue): boolean`

Write-back for inline editing. Strategy:
1. `ctx.getSectionInfo(container)` — gets the code block's exact line range
2. `app.workspace.getLeavesOfType("markdown")` — locates the live CodeMirror editor for this file
3. Scans lines for `block: <label>` (case-insensitive) within the range
4. Finds the indented body lines below the header (lines starting with space/tab or blank)
5. Replaces the body with two-space-indented new content via `editor.replaceRange()`
6. Returns `false` if no editor is available (reading mode) — the canvas re-renders with the original content

### `shared/editor.ts`
`insertTemplateAtCursor(editor, template)` — inserts a template string at the CodeMirror cursor position.

### `shared/indent-tree.ts`
Reusable indent-based tree builder. Converts indented text into a `TreeNode[]` hierarchy. Used by Mind Map and OST parsers.

### `shared/svg.ts`
`createSvgEl<K>(tag, attrs)` — typed helper for constructing SVG elements. Avoids repetitive `createElementNS` calls.

### `shared/constants.ts`
Shared numeric constants: `SWIPE_THRESHOLD_PX` (carousel swipe threshold), `FULL_WIDTH_MARGIN_PX` (readable-line-width layout margin).

### `shared/lifecycle.ts`
`onDisconnected(el, cleanup)` — calls `cleanup()` once when `el` is removed from the DOM. Observes the nearest `.workspace-leaf-content` ancestor (not `document.body` with `subtree:true`) to keep MutationObserver scope tight. Used by `renderer/story.ts` to release MediaQueryList listeners.

### `shared/block-editor.ts` + `renderer/block-editor.ts`
Inline block editing extracted from `canvas.ts`. `renderBlockBody` and `activateBlockEdit` live here. `block-editor.ts` in `shared/` handles the `writeBlockContent` write-back.

### `shared/wardley-edit.ts`
Write-back utilities for the Wardley Map visual editing features:
- `writeWardleyComponent(app, ctx, el, name, vis, evo)` — patches `[vis, evo]` on a component line
- `addWardleyComponent(app, ctx, el, sourceName, newName, vis, evo, withLink)` — inserts a new component after the source line, optionally adds a link
- `renameWardleyComponent(app, ctx, el, oldName, newName)` — updates all references (component, anchor, links) in a single pass

### `shared/story-edit.ts`
Write-back utilities for the User Story Map visual editing features:
- `addStoryTask(app, ctx, el, stepName, taskName)` — appends a new `task:` line to the named step; deduplicates name with numeric suffix
- `writeStoryMeta(app, ctx, el, key, value)` — writes or removes a `user:` or `goal:` top-level line
- `renameStoryActivity(app, ctx, el, oldName, newName)` — renames the `activity:` line in-place
- `renameStoryStep(app, ctx, el, oldName, newName)` — renames the step declaration and cascades to all slice cell `step:` references
- `renameStoryTask(app, ctx, el, oldName, newName)` — renames the `task:` line and cascades to all slice cell task key references (lowercased)
- `moveStoryTaskSlice(app, ctx, el, taskName, stepName, fromSlice, toSlice)` — updates slice cell references to move a task between bands within the same column
- `reorderStoryTask(app, ctx, el, stepName, sliceName, fromIndex, toIndex)` — reorders task keys in a slice cell list
- `moveStoryTaskCrossColumn(app, ctx, el, taskName, fromStep, toStep, toSlice)` — moves the `task:` declaration between step blocks and updates all slice cell references across every slice

All functions use the shared `resolveEditor` helper (same `ctx.getSectionInfo` + `getLeavesOfType("markdown")` pattern). All multi-line edits are applied bottom-up to avoid line number shifting.

### `shared/links.ts`
Link resolution infrastructure used by all processors:
- `extractInlineLinks(source)` — strips heading-link annotations from keyword lines and returns `{ strippedSource, inlineLinks }`. Supports two annotation styles on any `keyword: label <annotation>` line: `[[#Heading]]` wiki-links and `[text](#Anchor%20Text)` Markdown links (anchor is URL-decoded to recover the heading). Both regexes use `[ \t]*` (not `\s*`) before the link marker to prevent cross-line matching.
- `getFileHeadings(app, ctx)` — returns all heading texts in the current note via `metadataCache`, synchronous.
- `createLinkResolver(inlineLinks, headings)` — builds a `LinkResolver` that resolves a label to a heading. Priority: inline annotation > auto-detected heading.
- `buildLinkSupport(app, ctx, inlineLinks)` — convenience wrapper returning `{ resolver, navigateTo }` for use in processor factories.
- `NULL_RESOLVER` — no-op resolver used in tests and as the default when app/ctx are unavailable.

---

## Data flow: canvas render

1. Obsidian calls the registered `MarkdownCodeBlockProcessor` with `(source, el, ctx)`.
2. The appropriate parser runs on `source`, returns `ParseResult`.
3. On failure: `renderError(error, el)` — done.
4. On success: the appropriate renderer builds DOM inside `el`.
5. For grid canvases: `renderCanvas(definition, data, links, el, navigateTo, app, ctx)`.
   - `app` and `ctx` are passed so blocks become click-to-edit.
6. `initCanvas()` injects the shared header (title, controls, PNG, presentation).
7. `setupMobileCarousel()` attaches swipe/nav listeners.

The `navigateTo` callback closes over `app` and `ctx.sourcePath` in `main.ts`, keeping all renderers free of Obsidian API imports.

Link resolution uses `shared/links.ts`: every processor calls `extractInlineLinks` to strip `[[#Heading]]` annotations, then `buildLinkSupport` to create a `LinkResolver` combining inline annotations and auto-detected headings. The resolver and `navigateTo` are passed to renderers that support linking: grid canvases, OST, Impact Map, Mind Map.

---

## Data flow: inline block edit

1. User clicks a block body (`.vzd-block-editable`).
2. `activateBlockEdit()` replaces the body with a `<textarea>` pre-filled with current content.
3. User edits; blur (or Tab for spaces) fires the commit path.
4. `writeBlockContent()` locates the editor, patches the source, returns `true`.
5. `renderBlockBody()` re-renders the block optimistically.
6. Obsidian detects the source change and triggers a full re-render shortly after.
7. On Escape or `writeBlockContent()` returning `false`: discard, re-render with original content.

---

## Data flow: canvas insert

1. User triggers command (palette, per-framework command, or ribbon icon).
2. `CanvasInsertModal` opens with the full `frameworkOptions` list.
3. User selects a framework.
4. `insertTemplateAtCursor(editor, template)` inserts the template.
5. User fills in content; switching to Read View triggers the processor.

---

## Extension points

### New grid framework
Create `src/frameworks/yourframework.ts` with a `FrameworkDefinition`, add it to `ALL_FRAMEWORKS` in `main.ts`. Parser, renderer, insert command, modal entry, and inline editing are all automatic.

### New non-grid framework
1. Add types to `types.ts`
2. Create parser file (`src/yourframework.ts`) returning `{ ok, data/error }`
3. Create renderer in `src/renderer/yourframework.ts`, call `initCanvas()` for the shared header
4. Export from `src/renderer.ts`
5. Add to `CUSTOM_RENDERERS` in `main.ts`
6. Add template constant to `src/templates.ts`
7. Add the canvas wrapper CSS class to the presentation selector in `src/renderer/controls.ts`

---

## Build system

esbuild bundles `src/main.ts` into `main.js` (CJS, ES2018). All `obsidian` imports are external — resolved at runtime from Obsidian's built-in module. Source maps are inlined in dev mode, omitted in production.

`main.js` is gitignored but required in every GitHub release alongside `manifest.json` and `styles.css`.

---

## Scripts

### `scripts/docs-check.sh`
Runs in CI (after `npm test`, before `npm run build`). Checks three mechanical facts:
- `manifest.json` version === `package.json` version
- `manifest.json` version is a key in `versions.json`
- `README.md` mentions every framework ID (derived from `src/frameworks/*.ts` filenames + non-grid renderer IDs)

Fails with a non-zero exit code so branch protection blocks the merge on failure. Also runnable locally: `bash scripts/docs-check.sh`.

---

## Test suite

Vitest is used for unit-testing parsers and renderers. All parser files have corresponding `*.test.ts` files. Renderers are covered by smoke tests in `src/renderer/renderer.test.ts` using happy-dom. The shared `indent-tree.ts` utility is also tested.

**Test infrastructure:**
- `src/__mocks__/obsidian.ts` — stubs `setIcon`, `MarkdownView`, `Plugin`, `moment`, `Notice` so tests run without Obsidian
- `src/test-setup.ts` — polyfills `createEl`, `addClass`, `empty`, etc. on `HTMLElement.prototype`; stubs `window.matchMedia` and `requestAnimationFrame`
- `vitest.config.ts` — `resolve.alias` maps `obsidian` → `src/__mocks__/obsidian.ts`

**Current test files (204 tests, 18 files):**
- `src/impact.test.ts`
- `src/mindmap.test.ts`
- `src/ost.test.ts`
- `src/parser.test.ts`
- `src/sipoc-flow.test.ts`
- `src/sipoc.test.ts`
- `src/story.test.ts`
- `src/venn.test.ts`
- `src/wardley.test.ts`
- `src/shared/indent-tree.test.ts`
- `src/shared/block-edit.test.ts`
- `src/shared/links.test.ts` — covers `extractInlineLinks` (wiki-link and Markdown annotation styles, cross-line safety)
- `src/shared/wardley-edit.test.ts`
- `src/i18n/i18n.test.ts`
- `src/renderer/renderer.test.ts` — smoke tests covering all renderers

Run with `npm test`. `npm run coverage` runs with `@vitest/coverage-v8` and enforces minimum thresholds (statements ≥ 58%, branches ≥ 54%, functions ≥ 44%, lines ≥ 60%). CI pipeline: type-check → lint → test → docs-check → build. PRs blocked until `ci` check is green (branch protection).
