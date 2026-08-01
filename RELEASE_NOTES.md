## 0.41.0

- **SCQA / SCR tree view is now a swim-lane diagram.** With `view: tree`, the narrative renders as labelled horizontal bands — Situation / Complication / Question / Answer (or … / Resolution for SCR) — each with its own theme-aware colour, outlined boxes that wrap their full text, and the role shown as an italic caption. It now shares the Opportunity Solution Tree's visual language. Any node can carry **chevron bullets** (a bare indented line under a node), with inline add/edit/remove in Live Preview. The card **grid view is unchanged**, and legacy bare-indent narratives still render.

- **Fix: Opportunity Solution Tree box sizing.** Node boxes now measure their real wrapped height from the DOM, so multi-line labels no longer clip and bullet lists always stay inside their box (previously an under-measured box could push bullets to the top-left corner).
