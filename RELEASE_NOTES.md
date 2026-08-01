## 0.44.0

**Breaking: the matrix DSL is now one unified grammar.** All matrix charts —
priority grids, scenario 2×2s, and free scatter plots — collapse into a single
model: two tick-labelled axes forming a cell grid, plus items placed on the
plane. Old matrix/scenario blocks must be rewritten (there is no back-compat).

- **`type: matrix[, preset]`** — one type. Preset ∈ `pain`, `opportunity`,
  `impact`, `assumption`, `scenario`, or omit for a blank chart. A preset fills
  the axes, per-cell heat, and colour, and adapts its heat to whatever grid the
  ticks define. `type: scenario` is gone — it's `type: matrix, scenario`.
- **`x:` / `y:`** — `Title | tick | tick | …`. Ticks are equal bands, so N×M
  ticks define an N×M cell grid (a 4×4 is just four ticks per axis).
- **`tN: Name | heat`** — name and/or tint a cell. Cells are auto-ided
  `t1…t(N·M)` in reading order (t1 = top-left). Heat ∈ `very-high`, `high`,
  `medium`, `low`, tinted from the chart's single base colour.
- **`item: Label [x, y]`** or **`item: Label at: tN`** — one content keyword.
  A card (indented lines = body) placed at a free coordinate (`[x,y]` in 0…1,
  origin bottom-left) or snapped to a cell centre. In edit mode items drag to
  reposition (writing `[x, y]` back) and click to edit their body.
- **Item linking.** An item label links to a heading or a Linear/Upvoty ticket:
  auto-detected when the label matches a heading name, or via an explicit
  `[[#Heading]]` / `[text](TICKET)` annotation placed before the position token
  (e.g. `item: Fix login [Fix login](CORE-1234) at: t1`). Item bodies keep full
  link support, and the global Linear/Upvoty key enrichment still scans all
  rendered text.

Gone entirely: `layout:`, `block:` + cell-key labels, `zone:`, `cards:` /
`| card`, the `top-left:` quadrant keywords, and the three different `x-axis:`
grammars. One type, one axis grammar, one content keyword, one heat concept.
