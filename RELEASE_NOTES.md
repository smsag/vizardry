## 0.46.6

Internal refactor — no functional changes.

- Split the three largest source files (two diagram renderers and the shared
  type definitions) into smaller, focused modules for maintainability. No
  change to any canvas's syntax, rendering, or behaviour; the full unit suite
  and a pixel-level visual-regression pass confirm identical output.
