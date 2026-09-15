## 0.69.1

The three write-back fixes deferred from the 0.69.0 review.

- **Fix: a story-map task edit could hit the wrong step.** Task names only
  have to be unique per step, so "Login" can exist under two steps — but
  renaming or deleting one found the first "Login" in the fence and rewrote
  every slice cell holding that key. Both edits are now scoped to the step
  the card sits in. Two related slips: a slice cell with no tasks
  (`step: Login` under `slice:`) could be mistaken for the activity step
  when the slice came first, so a new task landed inside the slice; and
  reordering tasks moved the wrong one when the cell also named a key the
  parser drops (a typo). Reordering now works on the tasks the canvas shows
  and carries unknown keys along at the end.

- **Fix: journey cards in a repeated `phase:` could not be edited.** The
  parser merges every block with the same phase name into one column, but
  the editor only looked inside the first block — so the cards from the
  second one answered "card not found" to rename, delete and move. Every
  block of that name now contributes its lanes, and a new card goes after
  the last one.

- **Fix: a tab counted as one column of indentation.** Obsidian indents
  with tabs by default (width 4); a pasted space-indented line under a
  tab-indented one landed a level deeper, or failed with "indent of 1 is
  not a multiple of the base indent". One `indentOf` helper now measures
  every line in every parser and edit helper, with a tab as four columns,
  so the two spellings of the same indent agree.

## 0.69.0

A quality and security review of the whole codebase and the browser
extension: about 90 fixes, and three principles written down in
`CONTRIBUTING.md` so the same classes of bug do not return.

- **Security: the browser extension no longer renders raw HTML from a
  Markdown file.** Prose between canvases went straight from `marked` into
  the page, so a `<script>` or an `onerror=` in a dropped file ran with the
  extension's origin. Prose now passes an allow-list sanitiser; links open in
  a new tab with `rel=noopener`. Reference-style links (`[text][ref]`)
  resolved to nothing in the viewer and work now. The viewer reports a
  file it could not read or one that is too large instead of staying blank.

- **Security: integration base URLs must be https.** The Linear and Upvoty
  API keys travel in a request header, so an `http://` or arbitrary base URL
  (typeable in settings, or arriving via a synced `data.json`) would have
  sent the key in clear or to the wrong host. Anything but an absolute
  https URL falls back to the default on load.

- **Fix: AI summaries were broken out of the box.** The Anthropic model ids
  carried a `-latest` suffix that the API rejects with 404. The list is now
  `claude-haiku-4-5`, `claude-sonnet-5` and `claude-opus-5`, an old id in
  `data.json` is healed on load, and opening the settings tab no longer
  silently rewrites a model id it does not recognise. Provider errors now
  carry the provider's own message instead of "unexpected response 400".

- **Fix: canvases leaked on every re-render.** The disconnect watcher that
  releases relink registrations, key badges, sticky-pin controllers and
  media-query listeners only observed the leaf root's direct children, so
  in a real Obsidian leaf it practically never fired. It now watches the
  subtree with coalesced sweeps. Key badges register their watcher after
  they are in the DOM (they used to fall back to `document.body`).

- **Fix: a crafted line could freeze Obsidian.** The inline-link regexes
  backtracked cubically on a keyword line with a long run of spaces and an
  unclosed `[[`; a few thousand spaces took seconds on the render path.
  They are linear now and a test times the pathological input.

- **Fix: write-back could corrupt or mis-edit a note.** Deleting a Node Map
  box left a `link: A --> B` line behind (the `-->` arrow was unknown to the
  editor) and the canvas then failed to parse; a SIPOC cell inserted after a
  top-level `link:` landed outside its row; editing a pace-layers cell wrote
  into the *next* pace-layers canvas when this one lacked the layer; a
  `block:Label` header rendered but could not be edited; a column-0 comment
  inside a block duplicated the line after it on edit; deleting a tree node
  took the comment before its sibling with it; and enabling `collapsed:`
  over a `collapsed: false` line did nothing.

- **Fix: parse problems are shown, not logged.** Pace layers, story maps and
  RACI reported unknown layers, unknown steps and multiple accountables to
  the developer console only; they use the warning chip under the canvas
  like every other framework. `root:`, `box:`, `link:` and the Wardley
  keywords are case-insensitive like the rest; an indented `title:` is
  content, not the canvas title; a block labelled `constructor` is no longer
  a "duplicate".

- **Fix: interactions that lost work or wrote when they should not.**
  A click inside an SVG rename box dismissed the edit; a plain click on a
  Wardley node or Node Map box rewrote its position and ate the rename;
  a Flow heading committed twice; Escape on a card-mode block re-rendered it
  as plain lines; clicking into and out of a block wrote an unchanged value;
  edit affordances appeared where there was no editor to write to; Node Map
  collapse and pin state was never persisted; Journey titles were editable
  in Reading View. Write failures in SIPOC, RACI, Test Card, the period
  field, Wardley unlink and Node Map now say so instead of showing a value
  the note never received.

- **Fix: presentation mode opened empty for Matrix, Concept Map, Test Card
  and Product Compass.** The overlay is now a dialog that takes focus and
  hands it back. Matrix pills answer the keyboard in edit mode and survive a
  cancelled touch; touch drags handle `touchcancel`; the item menu no longer
  opens twice on Android; Venn colours no longer flip between renders; the
  export API no longer returns a pinned clone as a second canvas.

- **Fix: settings and sideleaf.** Saving the secret picker without a change
  wiped the integration's cache; tabbing through the API-key field rewrote
  the keychain entry; a settings write failure was invisible; the heading
  suggester produced `[[#Heading]]]]` with bracket auto-pairing; a double
  click could open two Vizardry tabs; card state is saved after each
  change; copy-key reports success or failure; a Linear card showed the
  Upvoty error text; a post URL broke on an app URL with a query string;
  a prefix containing a dash (`MY-APP`) mis-cut the key.

- **Reliability: bounded waits.** A server's `Retry-After` is capped at five
  seconds with jitter (a rate-limited canvas used to wait out a two-minute
  penalty, every key in lock-step); the settle hook no longer waits forever
  on an image that never loads; a cache flush settles the writes it folds
  in; changing a credential also drops in-flight requests for the old one.

- **Build and CI.** The extension is type-checked, linted and tested (it
  was none of these), and its manifest version is bumped and asserted with
  the plugin's (it had drifted to 0.61.1). Tests are linted. Compiler
  strictness: unused symbols, implicit returns, switch fall-through and
  missing `override` fail the build; 34 dead symbols and ~100 lines of dead
  CSS went, and `scripts/css-check.mjs` keeps it that way. Coverage
  thresholds sit just under the real numbers. The release workflow attaches
  only the tag's own notes and no longer interpolates inputs into shell;
  baseline regeneration fails loudly and never pushes to `main`; the visual
  suite reports every mismatched fixture. One es2020 target for all bundles.

- **Docs.** The sideleaf is documented in the README; the export API
  reference the README linked to exists; the PR template lists real files;
  the syntax reference no longer claims v0.45.1.

## 0.68.1

- **Fix: a key could go missing and the settings said only "Not set".** The
  plugin stores the *name* of a secret; the key itself lives in Obsidian's
  keychain. If that secret was renamed or deleted there, the link was left
  pointing at nothing — and the row showed exactly what an integration you had
  never configured shows. Two very different problems, one message, and the
  wrong instinct: people went looking for a lost key rather than a broken link.

  The row now says which it is. **No such secret** means the keychain holds
  nothing under that name and the fix is to re-link, not to paste the key
  again; the description under it says so and points at **Link…**. **Not set**
  now means what it says. A name your Obsidian version can never store is
  called out as an invalid name, and an Obsidian with no keychain at all says
  that instead of blaming the key.

- **Fix: the picker could only offer secrets it had managed to list.** There
  was no way to type a name — so a secret Obsidian held but the listing missed,
  or one that did not exist yet, could not be linked from Vizardry at all. The
  search box now doubles as a name field: type a name the keychain doesn't
  hold and it is offered as **Use the name «…»**, marked *will be created*
  until you enter a value for it.

  The picker also shows the name you currently have linked even when no such
  secret exists, marked *no such secret*. It used to show nothing at all, which
  looked identical to never having linked anything.

- **Fix: the secret list came back empty on mobile.** Obsidian's API is typed
  as returning an array, but the mobile implementation returns a promise. Read
  as an array, that yielded nothing — so on a phone or tablet the picker could
  show an empty keychain while the keychain was not empty.

- **Fix: a rejected key write was silent.** Obsidian only accepts a secret name
  of lowercase letters, digits and dashes, and throws on anything else. The
  rejection went to the developer console and nowhere else, so entering a key
  looked like it had worked until the badge refreshed. A failed write now says
  what went wrong, and a name Obsidian will not accept is caught before the
  write is attempted.

## 0.68.0

- **New: the Vizardry sideleaf has its own icon.** The panel used to borrow the
  same icon as the "insert a canvas" ribbon button, so the two were
  indistinguishable in the sidebar. It now carries a V with a spark — the
  monogram, and the wizardry in the name. The ribbon keeps its old icon, since
  it still means "insert a canvas".

- **New: one actions menu for every item on a canvas.** A Story Map task, a
  Journey card, an SCQA card, a Problem card, a Compass entry, an Impact Map /
  Mind Map / Opportunity Solution Tree node, a Fishbone node and a Node Map box
  now all carry the same `⋯` control. It opens a menu — right-click does the
  same on desktop, and a long press does it on a phone.

  **Why.** Each of those canvases had grown its own delete: a 16-pixel red
  circle perched on the item's corner, which appeared only while the mouse was
  over it. Nine near-identical copies, and every one of them carried the same
  two faults described below. A menu is the one shape that works on all of
  them — including the SVG canvases, where there is no box to hang a button
  off — and it leaves room for the other per-item actions those canvases will
  want, instead of a growing row of tiny icons.

  The control itself is now neutral: it opens a menu rather than deleting, so
  the red has moved to the **Delete** row inside the menu, in whatever red your
  theme uses for a destructive action.

- **Fix: deleting an item was impossible on a phone or tablet.** Every one of
  those controls was hidden until the item was hovered, and a touch screen
  never hovers — so on mobile there was simply no way to delete a card, a node
  or a box. They are now permanently visible on touch.

- **Fix: deleting an item was impossible by keyboard, on every platform.** The
  same controls were hidden in a way that also removed them from the tab order,
  so they could not be reached by keyboard and were invisible to screen
  readers even on desktop. Each is now focusable, becomes visible when tabbed
  to, and the SVG ones answer Enter and Space.

- **Fix: the controls were too small to hit reliably.** A 16-pixel target is
  two thirds of the 24 pixels the accessibility guidelines ask for. The badge
  still looks the same size — six canvases keep their appearance — but its
  clickable area now extends to 24 pixels.

- **New: swipe a sideleaf card aside to remove it.** Drag a Linear or Upvoty
  card left or right and it follows your finger; carry it far enough and it
  goes. The card's `⋯` menu does the same thing, so nothing depends on the
  gesture. It is offered in the sideleaf and nowhere else: on the card canvases
  a horizontal drag already means *move this card to another column*, and
  taking that over would break the thing those boards are for.

- **New: ten seconds to undo a removed card.** Closing a card — or using
  **Clear all** — leaves a short **Undo** in the panel header. Several removals
  inside the window collapse into one offer, so clearing the panel and then
  closing one more card gives you a single Undo rather than a queue to work
  back through.

  Canvas deletions deliberately do *not* get this bar: they change the note
  itself, so the editor's own undo already restores them (Cmd/Ctrl+Z, or the
  undo button on mobile). Offering a second, separate undo for the same action
  would let both fire and put the item back twice.

## 0.67.0

- **New: the Vizardry sideleaf — Linear and Upvoty items open as cards in a side
  panel instead of a floating popover.** Clicking a `CORE-1234` or `UPV-…` key
  now reveals a panel in the right sidebar and adds a card for that item; the
  key itself lights up to show it has one. A card stays until you close it, or
  until you use **Clear all** in the panel header, and it survives closing the
  note, restarting Obsidian and reloading the plugin.

  **Why.** A popover was the wrong shape for this in Obsidian. It floated over
  the note, had to be positioned by hand against the window edge, could not be
  dismissed by clicking away, and — worst of it — was destroyed the moment the
  note that spawned it was closed or merely scrolled far enough, taking the
  summary you were reading with it. Comparing two tickets meant two popovers
  overlapping your writing. Cards sit beside the note instead of on top of it,
  stack as you open them, and belong to you rather than to the paragraph they
  came from. A key mentioned in five notes opens one card, not five: clicking
  it again surfaces and flashes the card that already exists.

  The panel re-checks every card whenever it comes back into view, so a card
  left open all day is not showing this morning's status. How often that
  actually reaches the network is still governed by the refresh settings below.

  Open the panel on its own — with no card pending — from the command palette:
  **Open the Vizardry sideleaf**.

- **Fix: saving a setting could wipe your cached summaries.** The plugin's data
  file holds the Linear and Upvoty summary caches next to the settings, and
  every settings save wrote back a copy of those caches taken when Obsidian
  started — silently discarding every summary generated since. Toggling any
  setting after a day's work threw away the day's summaries, which then had to
  be re-generated (and re-billed) on the next look. Settings and caches are now
  kept strictly apart, and neither can overwrite the other.

- **Fix: "Status refresh" and "Post cache" did nothing.** Both settings were
  read only by code that nothing called, so every preview fetched from Linear or
  Upvoty afresh no matter what interval you had set. They now do what they say:
  within the interval an item is served from memory, and the network is left
  alone. Opening the same key repeatedly is free.

- **Fix: a corrupted cache entry could serve a stale summary forever.** An entry
  whose timestamp was missing or unreadable passed every freshness check, so it
  never expired and never got regenerated. Such entries are now dropped when the
  cache loads. A hand-edited or out-of-range setting is likewise repaired on
  load rather than producing silent nonsense — a non-numeric cache lifetime used
  to make *every* entry read as expired, re-fetching on every hover.

- **Keys now follow your theme's tag styling, a shade quieter.** A Linear or
  Upvoty key inline in a note is drawn from the same variables your theme uses
  for its own tags, so it inherits that shape and colour instead of imposing
  Vizardry's, and sits a step below full strength so it does not shout over the
  sentence around it. Hovering or focusing it restores the full colour.

- **Statuses are no longer drawn as tags.** A workflow state and a ticket key
  used to be the same lozenge, with nothing to say which was which. A state is
  now an underlined label, and the rule beneath it takes the state's own colour
  from Linear or Upvoty — a colour both APIs were already sending and the plugin
  was throwing away. The label still spells the state out, so nothing depends on
  telling two colours apart.

- **New: "Pain Point Matrix" can be inserted from the picker.** The preset was
  documented and supported as `type: matrix, pain`, but had no entry in the
  insert modal or the command palette, so the only way to get one was to type
  the block by hand.

- **Changed: "Matrix" inserts the blank two-axis chart it always described.** It
  previously seeded the Impact/Effort template, making it a duplicate of
  "Impact / Effort Matrix", while the plain chart was reachable only through a
  separate "Plotted Matrix" command. That command is gone — "Matrix" is now the
  one that gives you the blank chart. If you had a hotkey bound to *Insert
  Plotted Matrix*, rebind it to *Insert Matrix*.

- **Smaller fixes.** Upvoty posts written as a URL slug and as a UUID are one
  item again rather than two, halving the fetches and AI summaries for them.
  Escaped markup in an Upvoty description no longer comes back as markup. A
  missing date renders as nothing instead of "Updated NaNd ago", and a clock
  skewed against the API no longer shows a negative age. An unrecognised AI
  provider now says so instead of failing with an internal error. Rate-limit
  retries honour the server's requested delay regardless of header casing. Key
  badges are reachable by keyboard, with a visible focus ring and an announced
  expanded state.

## 0.66.0

- **BREAKING — removed: the image carousel (`type: carousel`).** The gallery
  that showed two or more images one at a time, with prev/next, a caption and a
  fullscreen view, is gone: the `type: carousel` block now renders "Unknown
  type". The feature moved to the Schreibstube plugin, which hosts it as its own
  ` ```schreibstube-slideshow ` code block. If you used it, keep the images in
  the note and reach for Schreibstube's slideshow, or lay the images out by hand.

- **BREAKING — removed: stacking several canvases in one fence.** Repeating the
  `type:` line inside one ` ```vizardry ` fence used to render the canvases as a
  navigable carousel. That is gone; a fence is one canvas again. A block with
  more than one top-level `type:` line now renders only the first — split the
  rest into their own fences. This removes the read-only limitation that came
  with the stacked view: a lone canvas stays editable in Live Preview as before.

- **Fix: exported PNGs of SVG canvases were mostly black** — a Wardley map saved
  with the download button came out with solid black bands covering the drawing,
  and the same flaw affected every SVG-based canvas (Wardley, Mind Map,
  Opportunity Solution Tree, Fishbone, Venn, Radar, Node Map, Concept Map). The
  image library used for the export copies styling onto the element it captures
  but not onto the shapes inside an SVG, and the captured copy can't see the
  plugin's stylesheet — so every shape fell back to the SVG default of opaque
  black. The paint of each shape is now carried into the capture explicitly.
  Affects `api.exportCanvas` for other plugins too. Present since PNG export was
  added; found by a real-vault export of 0.65.0.

## 0.65.0

- **BREAKING — removed: the "Export / print note (with visualizations)" command.**
  Shipped in 0.64.0, removed here. It is gone entirely: the command, its dialog,
  the templates, page numbers and running headers.

  **Why.** The feature was built on Paged.js, a CSS paged-media polyfill that
  cost 846 kB of a 1.70 MB plugin — more than half the download, paid by every
  user on every update whether or not they ever printed a note. In the weeks
  after 0.64.0 it also needed a continuous stream of integration fixes (blank
  PDFs, a first page in the wrong font, diagrams mis-measured, torn or rendered
  as black boxes), each one a fight with how Paged.js paginates rather than a
  problem with the notes being printed. Removing it takes the plugin to 0.73 MB
  and hands PDF export to plugins that typeset properly — which the new export
  API below exists to feed.

  **If you used it.** Stay on 0.64.0 until a print/PDF plugin you use supports
  this API; nothing in 0.65.0 is required for canvases to render. Obsidian's own
  "Export to PDF" still works, without Vizardry's templates and page numbers.
  Your saved print settings stay in the plugin's data file, unread and harmless.

- **New: a public export API for other plugins** — Vizardry now exposes the same
  canvas-to-PNG capture its download button uses, so another plugin (a PDF or
  document pipeline, say) can place a canvas as an image instead of
  reimplementing the capture. Callers get the canvases in a rendered note, a
  settle hook to wait for rendering, and per-canvas capture with a scale, a pixel
  ceiling, an optional forced-light rendering for white paper, a background
  colour and a choice about the canvas title row. See
  [docs/vizardry-export-api.md](docs/vizardry-export-api.md).
- **New: offscreen renders can switch off key enrichment** — a plugin that
  renders a note into its own offscreen host can mark that host so Linear /
  Upvoty keys render as plain text, with no badges, popovers, AI summaries or
  network calls — which is what keeps an offline document build offline. The
  guarantee Vizardry's own PDF export used to make for itself, now available to
  the plugins that took over the job.
- **Fix: exporting a collapsed canvas produced an empty title bar** — a canvas
  saved with `collapsed: true` is now expanded for the capture, so the PNG
  contains the drawing rather than just its header.
- **Fix: a very wide canvas is scaled down rather than failing to export** — the
  capture reduces its resolution to stay within a pixel ceiling instead of
  producing an oversized image that can exhaust memory on a phone.

## 0.64.0

> **Note (added later):** the print/PDF export described below was removed in
> 0.65.0. See that entry for why and for what replaces it.

- **New: Export / print a note to PDF** — a desktop command ("Export / print
  note (with visualizations)") that renders the whole note — including every
  Vizardry canvas and Mermaid diagram — and paginates it for printing or
  Save-as-PDF. A dedicated dialog offers typographic **templates** (Manuscript,
  Technical, Minimal), **page size** and orientation, **margins**, **start each
  heading 1 / heading 2 on a new page**, **page numbers** (format and position),
  a **running header**, and a title toggle — with a **live page-by-page preview**
  and a page count. Page numbers use real CSS paged-media counters (via Paged.js),
  which the browser's own print can't produce. Linear / Upvoty issue keys print
  as plain text: their preview popovers and AI summaries are never included, and
  no enrichment network calls fire during export.
- **Fix: Sketch (hand-drawn) mode now works in pop-out windows** — the sketch
  styling and the SVG filter it relies on are applied to every open window, not
  only the main one, so a canvas dragged into a pop-out no longer loses the
  hand-drawn look.
- **Fix: Node Map colour picker in pop-out windows** — its click-outside
  dismissal now works in a pop-out window, and it no longer leaves a stray
  document listener behind after closing.
- **Fix: pin / collapse now persists on CRLF notes** — toggling `sticky:` or
  `collapsed:` on a note saved with Windows (CRLF) line endings silently did
  nothing; it now writes correctly and preserves the file's line endings.

## 0.63.0

- **New: Pin a canvas while you scroll (`sticky: true`)** — a new pin button in
  the canvas toolbar (left of minimize) keeps the full canvas anchored to the
  top of the reading pane while you scroll through the rest of the note, so a
  reference canvas whose blocks link out to detail sections further down stays
  in view. The pinned copy is a read-only clone; only one canvas is pinned at a
  time (the one you most recently scrolled past). Persisted as `sticky: true`.
  Reading View on desktop only — the button is hidden elsewhere.

## 0.62.0

- **New: Blue Ocean Strategy Canvas (`type: strategycanvas`)** — plot the
  competing factors of an industry against offering level (Low → High, 0–10)
  and draw one value curve per player. `series: Us | Rival | Industry` names
  the curves; each `factor: Name | s1 | s2 | s3` gives one score per series.
  Curves are drawn in accent-harmonised colours with a legend.
- **New: Blue Ocean Buyer Utility Map (`type: utilitymap`)** — the 6×6 map of
  buyer-experience stages against utility levers. Mark cells with
  `utility: <Stage> | <Lever> | <note>` (a leap you create) or
  `pain: <Stage> | <Lever> | <note>` (friction you impose); the canonical six
  stages and six levers default in, with optional `stages:` / `levers:`
  overrides and short-alias matching.
- **New: ERRC Grid (`type: errc`)** — the Blue Ocean Four Actions Framework
  (Eliminate · Raise · Reduce · Create) as a grid canvas.
- **New: Fishbone is now a true herringbone (Ishikawa) diagram** — a
  horizontal spine driving into the effect head, with category bones angled
  off it (alternating above and below), causes branching from each bone, and
  sub-causes ticking outward. Category colours are harmonised from your
  accent. In-place editing (rename / add / delete on every level) is
  preserved.
- **New: Fishbone category presets** — `type: fishbone, 6m` (manufacturing
  6M), `fishbone, service` (4S), and `fishbone, marketing` (7P) pre-seed the
  canonical category bones.
- **Improved: Fishbone parsing is now graceful** — an orphan cause, an
  unrecognised line, or a duplicate effect skips with a warning chip instead
  of failing the whole canvas; indentation is treated as cosmetic. Only a
  missing `effect:` is fatal.

## 0.61.6

- **Fix: image carousel no longer crashes on an empty images block** — a
  `type: carousel` fence with no `image:` lines caused a TypeError that
  prevented the entire canvas from rendering.
- **Fix: SIPOC / RACI editing no longer inserts text after the closing fence**
  — writing a new cell value into the last row/task placed the line outside
  the code block; it now stays inside.
- **Fix: Linear "no summary" message now actually displays** — the fallback
  error span was created then immediately destroyed by a `textContent`
  assignment in the same expression.
- **Fix: URLs with `://` are no longer truncated in Wardley Maps and Pace
  Layers** — the inline-comment stripper treated `://` as a comment marker,
  silently cutting content after the protocol prefix.
- **Fix: `-->` arrow in Node Maps now works correctly** — `link: A --> B`
  previously left a stray dash in the source node name; the parser now
  recognises the double-dash arrow form.
- **Fix: renaming a Wardley component updates both sides of self-links** —
  `link: Auth -> Auth` previously only renamed the left side, breaking the
  reference on the right.
- **Fix: keywords are now case-insensitive in 5 more parsers** — Impact Map,
  Story Map, Venn, RACI, and Journey now accept `Phase:`, `Actor:`, etc.
  the same way every other parser already did.
- **Fix: Impact Map rejects empty required fields** — `actor:`, `impact:`,
  and `deliverable:` with no name now produce a clear error instead of
  silently creating a blank entity.
- **Fix: section-preview and key-enrichment popovers clean up on plugin
  unload** — disabling or reloading the plugin no longer leaves orphaned
  popover DOM elements and leaked event listeners.
- **Accessibility: keyboard support for matrix pills, Venn links, and
  carousel fullscreen controls** — all now respond to Enter/Space and are
  reachable by Tab.

## 0.61.5

- **Fix: canvas no longer jumps when editing** — activating an edit field
  (clicking a card, renaming a node, opening an inline input) and confirming
  changes no longer causes the viewport to scroll erratically. Two root
  causes fixed across all canvases: browser `.focus()` calls now pass
  `preventScroll`, and every `editor.replaceRange()` path now snapshots and
  restores the scroller position so CodeMirror's scroll-to-cursor doesn't
  fire.

## 0.61.4

- **Sketch mode: much more readable** — the hand-drawn line wobble now
  applies only to SVG shapes (paths, lines, circles), leaving text and
  labels crisp instead of slightly displaced. The base type scale is
  larger (1.35× instead of 1.2×) to better compensate for Caveat's small
  x-height, and the monochrome ink is darker (32% vs 42% lightness) for
  stronger contrast.


## 0.61.3

- **Internal: unified Linear and Upvoty cache implementations** — both
  integrations now share a single generic `IntegrationCache` class, eliminating
  ~200 lines of near-identical code that previously had to be kept in sync.
- **Internal: inlined thin tree-edit wrappers** — four one-liner forwarding
  modules (fishbone-edit, impact-edit, mindmap-edit, ost-edit) replaced with
  config constants passed directly to the shared engine, removing ~450 lines
  and 8 files with no change in behaviour.
- **Internal: removed pass-through and single-use modules** — `getEditorAccess`
  (a pass-through to `resolveEditor`), `vault.ts`, `nodemap-colors.ts`, and an
  unused constant deleted or inlined into their sole consumer.

## 0.61.2

- **Performance: duplicate API calls eliminated** — rapidly clicking the same
  Linear or Upvoty badge no longer fires duplicate fetch + LLM summarise
  chains; concurrent callers share a single in-flight request.
- **Resilience: LLM model IDs no longer date-stamped** — defaults switched
  from snapshot IDs (`claude-haiku-4-5-20251001`) to evergreen aliases
  (`claude-haiku-4-5-latest`) so summarisation survives upstream deprecations.
- **Performance: settings text fields no longer save on every keystroke** —
  typing into sketch font, URLs, or key prefix fields now debounces disk
  writes (300 ms after the last character).
- **Performance: heading autocomplete in large notes** — the fence-detection
  scan now runs backward from the cursor instead of forward from line 0,
  reducing per-keystroke cost from O(n) to O(k).
- **Reliability: status caches are now bounded** — Linear and Upvoty status
  caches cap at 200 entries with LRU eviction, matching the discipline
  already applied to summary caches.

## 0.61.1

- **Fix: editing a Forces or Idea line in Product Compass no longer breaks
  onto a new line** — the click-to-edit input is full-width, which didn't fit
  next to the ▸ bullet in plain inline flow, so entering edit mode wrapped it
  onto its own line. The row is now a flex layout so the input correctly
  fills just the space next to the bullet.
- **Product Compass: Problem now stands out** — it gets the same accent-tint
  treatment as the Problem Statement canvas's "gap" stage card, so the crux
  of the brief reads as visually distinct the same way across both canvases.
- **Product Compass: larger default text** — Compass carries actual prose
  (problem statements, GTM notes) rather than the short block labels most
  other canvases show, so its default type scale is now 10% larger; every
  other canvas is unaffected.

## 0.61.0

- **New canvas: Product Compass (`type: compass`)** — a one-page discovery
  brief that works as an **index**: it summarizes a feature's thinking and
  **links out** to the deeper artifacts, sitting on top of a PRD and growing as
  discovery deepens. Four fixed sections — **Challenge** (Forces · Problem ·
  Case/Insights), **North Star**, **Solution & Test Ideas**, and **Go-To-Market
  / Pricing** — filled with freeform `keyword: value` lines (all optional; every
  keyword except `northstar` is repeatable). Insights render as **stat tiles**
  (`insight: 40% | of shops churn`), the North Star as a prominent banner, and
  `problem:` / `idea:` lines link out with `[label](canvas:Title)` /
  `[[#Heading]]` / ticket keys — so the Solutions section becomes a live index
  to your OSTs and Test Cards. Editable in Live Preview: click a line to edit,
  hover **×** to delete, **+** to add.

## 0.60.0

- **Link an item to another canvas, not just a section** — alongside heading
  links (`[[#Heading]]`) and ticket links, you can now write
  `[label](canvas:Title)` to jump to **another canvas in the same note** whose
  `title:` matches. A distinct canvas-link icon appears; clicking scrolls to
  that canvas and briefly highlights it. Works on every element that already
  supports links (grid blocks and their lines, Matrix, RACI, Pace Layers, tree
  nodes, and all card canvases). Same-note only for now, matched by title (give
  linked canvases a distinct `title:`); explicit `canvas:` form only, so it
  never collides with heading auto-detection.

## 0.59.0

- **Matrix items are now pills with a click-to-open detail popover** — each item
  shows as a compact title pill instead of an always-on card, so the plane stays
  readable no matter how many items you have. A small dot marks a pill that has
  a description; click a pill to open a popover with the details (and, in edit
  mode, to edit them). Items snapped to the same cell flow as a tidy pill cloud;
  free `[x, y]` items stay pinned at their point. Drag still repositions a pill.
- **Tree canvases: you can delete a branch node, not just leaves** — the delete
  **×** now appears on every node except the root (Mind Map, Opportunity
  Solution Tree, Impact Map, Fishbone), so the default branches are deletable
  too. Deleting a branch removes its whole subtree.

## 0.58.1

- **Matrix: removed the heat legend** — the *Very High / High / Medium / Low*
  pills in the matrix header are gone; the cell tinting speaks for itself, and
  the header stays clean.

## 0.58.0

- **New canvas: Test Card (`type: testcard`)** — plan one experiment on a single
  card, following *Hypothesis → Test → Metric → Criteria*: **We believe that…**,
  **To verify that, we will…**, **And measure…**, **We are right if…**. The
  first three steps carry a 1–3 rating gauge (how *Critical* the hypothesis is,
  the *Test cost* and *Data reliability* of the test, the *Time required* for
  the metric), and a `deadline:` shows as a header chip. Editable in Live
  Preview: click a step to edit its text, click a gauge dot to set the level,
  click the deadline to change it — all written back to source.
- **Fix: editing a canvas title no longer snaps back to the framework name** —
  in Live Preview, clicking a title sometimes committed the edit the instant it
  opened (Obsidian stealing focus fired a premature save), reverting an untitled
  canvas to its default name before you could type. The title now waits for you.
- **Fix: tree-canvas node rename is legible in sketch mode** — renaming a
  first-level node (Mind Map, Impact Map, OST, Fishbone, …) with sketch mode on
  showed white text on a white field; the editing box now stays readable.

## 0.57.0

- **Several canvases in one block — shown as a carousel** — repeat the `type:`
  line inside a single ```vizardry fence to stack multiple canvases; they now
  render one at a time as a carousel with prev/next arrows, a dot per canvas,
  arrow-key and swipe navigation. The canvases can be any mix of framework
  types (a SWOT, then a Problem Statement, then a matrix), each with its own
  title and toolbar. A block with a single `type:` line renders exactly as
  before. Carousel canvases are read-only for now — edit them as text (per-panel
  inline editing is planned for a later release).

## 0.56.1

- **Problem canvas editing: fixes to adding a card in Live Preview** — adding a
  card no longer shows a spurious "couldn't save" error, and new (and
  body-less) cards are sized to fit their editable fields instead of being
  clipped at the bottom of a column. Clearing both fields of a card now removes
  it cleanly.

## 0.56.0

- **Problem canvas: edit inline in Live Preview** — click a card's heading or
  body to edit it right in the card (no popup, no jump — the text just becomes
  editable), press Enter to save or Escape to cancel. A hover **×** deletes a
  card and **+ Add** under a column adds one; every change writes straight back
  to the source. (SIPOC flow stays a read-only view — edit it as a table.)

## 0.55.0

- **Problem canvas: stable card ids for linking** — cards can now carry an
  explicit id in the key (`reality_1: …`), and `link:` lines reference cards by
  that id instead of their heading text. A bare key auto-numbers
  (`reality`, `reality` → `reality_1`, `reality_2`), so short docs stay terse.
  This means links no longer break when two cards share a heading or when you
  edit a heading; existing heading-based links keep working as a fallback.

## 0.54.0

- **SIPOC flow view redesigned as a card grid** — the flow view now renders
  each node as a labelled card (column name + value) laid out on a tidy grid
  that lines up row-by-row and column-by-column, sharing the Problem canvas's
  flow renderer. The **Process** column is colour-highlighted so the heart of
  the process stands out, and a card whose value matches a note heading links
  out to that chapter. Authoring is unchanged (`row:` + `link:`), so existing
  SIPOC flow diagrams keep working.

## 0.53.0

- **New canvas: Problem Statement (`type: problem`)** — writes a problem
  statement as a left-to-right flow of linked cards following the arc
  *Setup → Gap → Stakes → Direction*. Pick the vocabulary with a subtype on the
  type line (no extra key): `problem, engineering` (ideal / reality /
  consequences / proposal), `problem, business` (vision / issue / method),
  `problem, research` (context / issue / relevance / objective), or
  `problem, fivew` (who / what / when / where / why / how). Each card is
  `heading | sentence` (the sentence is optional), and `link:` lines connect
  them — with chains (`A -> B -> C`) and `&` groups for fan-out and merge
  (`A -> B & C`), so one ideal can branch to several realities and several can
  merge back. The problem stage is tinted and the proposed fix is accent-filled
  so both stand out, and a card whose heading matches a note heading links out
  to that chapter. Read-only in this first release (edit as text).

## 0.52.3

- **Odyssey: multiple activities in the same year now all show** — a plan with
  two or more `year N:` lines for the same year previously rendered only the
  first; every activity is now kept and listed on the timeline.
- **Matrix: a custom title is respected again** — the canvas showed the preset
  name instead of the title you set; your title now displays correctly.

## 0.52.2

- **Sketch mode: fixed the type scale for the handwriting font** — in
  hand-drawn (sketch) mode the canvas title was oversized while body text (like
  the default placeholder text in blocks) was too small, because the Caveat
  handwriting font has different proportions than the UI font. Titles are now
  tamed and body text scaled up for comfortable reading; the A+/A− font
  controls still work.

## 0.52.1

- **Matrix canvases: items sharing a cell no longer overlap** — when a cell
  holds two or more items, their cards now stack (and scroll if the cell is
  full) instead of piling on the same point, so every description stays
  readable.
- **Image export on mobile now captures the whole canvas** — exporting a
  canvas collapsed into its mobile carousel (grid frameworks, Roadmap, Pace
  Layers, Story, Journey) previously saved only the visible panel; the export
  now reveals every panel first, so you get the full canvas.
- **Image export no longer includes editing controls** — the exported PNG
  omits the add / delete / unlink affordances (and the toolbar and carousel
  nav), so exports are clean and content-only.

## 0.52.0

- **Sketch (hand-drawn) mode** — a new toggle in **Settings → Vizardry →
  Appearance** restyles every canvas to look like a whiteboard sketch: a
  handwriting font (bundled Caveat, or your own via the optional font field),
  monochrome ink (colours desaturate to grey, derived from your accent so it
  stays theme-aware), and a subtle hand-drawn line wobble on diagram strokes.
  It applies live to all rendered canvases and is captured in PNG exports and
  presentation mode.

_Bundled font: Caveat © Pablo Impallari (Impallari Type), SIL Open Font
License 1.1._
