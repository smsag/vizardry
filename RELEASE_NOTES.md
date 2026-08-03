## 0.46.3

Internal refactor — no functional changes.

- Unified how the plugin's diagram renderers receive their editor/link
  context behind a single `RenderContext` argument, and simplified the
  renderer registry that dispatches each canvas type. No change to any
  canvas's syntax, rendering, or behaviour; the full test suite is unchanged
  and passing.
