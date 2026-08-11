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
