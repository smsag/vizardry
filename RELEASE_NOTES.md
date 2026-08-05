## 0.48.0

Two new canvases, and a palette that follows your accent.

- **Circle of Influence & Concern** (`type: circleofinfluence`) — Covey's
  proactivity model as concentric rings: **Concern** (things you can't act on),
  **Influence** (things you can affect), and an optional inner **Control** ring
  (your own actions). Author it one item per line with `concern:` / `influence:`
  / `control:`.

- **Whole Person / Four Dimensions** (`type: wholeperson`) — the Whole-Person
  Paradigm / "Sharpen the Saw": a four-wedge wheel (**Body · Mind · Heart ·
  Spirit**) scored 0–10, plus a card per dimension listing renewal activities.
  Author it as `body: <0–10> | <activity> | …`.

- **Accent-derived colours across all life-design canvases** — the Wheel of
  Life, Odyssey of Life, Whole Person, and Circle of Influence now derive their
  palettes from your Obsidian accent colour (harmonised hues rotated off the
  accent; the Circle fades a single accent monochrome inward), so they re-tint
  live when you change your accent instead of using fixed colours. Value meters
  (the Odyssey dashboard gauges) keep their intuitive low→high red→green.

Both new canvases are read-only and degrade gracefully — recoverable problems
surface as a warning chip instead of failing the whole canvas. Documented in the
README and the canvas syntax reference, and covered by unit tests plus
pixel-level visual-regression baselines.
