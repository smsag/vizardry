## 0.45.0

Wardley Maps get evolution, pipelines, and a batch of parser/editor fixes.

- **Evolution (movement) arrows.** `evolve: <Component> <evolution>` draws a red
  dashed arrow from a component's current position to a future evolution stage
  (visibility unchanged). In Live Preview the red "to-be" marker drags
  horizontally to retarget it.
- **Pipelines.** `pipeline: <Component> [x1, x2]` with indented
  `<Sub Component> [evolution]` lines draws the component as a box spanning an
  evolution range, holding sub-components at their own maturities. Each
  sub-component must fall within the range; unknown, duplicate, and
  out-of-range pipelines are rejected with a clear error.
- **Rename keeps the map intact.** Double-click-renaming a component now also
  updates its `evolve:` and `pipeline:` directives (previously they were
  orphaned and broke the map on the next parse), and renaming onto an existing
  component name is refused instead of creating a duplicate.
- **Parser & editor fixes.** Case-insensitive link resolution, self-link and
  duplicate-link rejection, boundary-safe component matching (so "Auth" no
  longer matches "Auth Service"), and trailing `// comment` support on every
  directive.
- **Rendering polish.** An evolution arrow rides above a pipeline box when a
  component is both, a degenerate zero-length arrow no longer draws backwards
  (at render and mid-drag), and a top/bottom pipeline box stays inside the plot
  frame.
