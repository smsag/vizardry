## 0.40.0

- **Redesigned Opportunity Solution Tree.** The OST now renders as labelled horizontal swim-lanes — Outcome, Opportunity, Solution, Experimentation — each with its own theme-aware colour, outlined boxes that wrap their full text, and per-node italic captions. The Opportunity lane accepts three keywords (`need:`, `pain:`, `desire:`) that share the lane and set the caption. Any node can carry **chevron bullets**: a bare indented line under a node becomes a bullet (add/edit/remove them inline in Live Preview).

  **Breaking change:** the `opportunity:` and `assumption:` keywords and the legacy bare-indent form were removed. Rename `opportunity:` lines to `need:`/`pain:`/`desire:`, and express former `assumption:` detail as bullets under a solution. A leftover `opportunity:` line now renders as a bullet rather than a node.

- **SCQA / SCR keyword-per-level syntax.** The narrative canvases now name each level on its own line (`situation:` → `complication:` → `question:` → `answer:`, or `resolution:` for SCR), matching the rest of the tree family.
