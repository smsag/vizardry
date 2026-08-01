## 0.41.1

- **Fix: misplaced / clipped content in the OST and SCQA/SCR swim-lane views.** Node boxes are now measured against `document.body` instead of their (often not-yet-attached) render container, so the real wrapped height is always available. Previously, when Obsidian rendered a block into a detached container — common in Live Preview and background panes — the measurement returned zero and fell back to an estimate that under-sized boxes, clipping multi-line text and pushing chevron bullets out of place. Boxes now fit their caption, wrapped label, and bullets in every view.
