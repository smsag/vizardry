## 0.46.0

Graceful rendering everywhere, plus a steadier mobile carousel.

- **Canvases no longer blank on a single bad line.** Every parser now degrades
  recoverable issues instead of replacing the whole canvas with an error. An
  empty label renders a faint `(empty)` placeholder; a mis-nested line, a bad
  reference, a duplicate, or stray syntax is skipped, clamped, or defaulted —
  and the canvas still renders what it can. This covers all frameworks: OST,
  SCQA/SCR, Wardley, Customer Journey / Service Blueprint, the Matrix, and every
  grid canvas (BMC, Lean, SWOT, …). Only the genuinely unrenderable (no root, no
  components, no grid) still shows an error.
- **A small warning chip** in the canvas header surfaces those recoverable
  issues (click it for the line-by-line list), so nothing is hidden — you keep
  your canvas and still get a nudge that something's off. This is especially
  helpful while typing in Live Preview, where a half-finished line no longer
  makes the whole canvas disappear.
- **Mobile carousel: stable height.** Browsing grid, roadmap, or pace-layers
  boxes on a phone no longer makes the content below the canvas jump — each
  carousel now reserves the height of its tallest box, so swiping keeps
  everything in place.
