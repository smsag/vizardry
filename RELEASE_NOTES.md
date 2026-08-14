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
