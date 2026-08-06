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
