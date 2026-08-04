## 0.47.0

Two new canvases for life and career design.

- **Wheel of Life** (`type: wheeloflife`) — the coaching classic as a segmented
  dartboard: each life area is a wedge filled from the centre out to its 0–10
  score, so imbalance is obvious at a glance. Notes appear on hover. Author it
  with `area: <Name> | <score> | <note?>`.

- **Odyssey of Life** (`type: odyssey`) — the Odyssey Plan from *Designing Your
  Life*: two to four parallel multi-year plans side by side, each with a
  headline, a timeline of year milestones, a dashboard of 0–10 fuel-gauge
  dials, and the open questions it raises. Author plans with
  `plan: <Label> | <Title>` and indent `year N:`, `gauge: <Name> | <0–10>`,
  and `question:` lines beneath.

Both are read-only in this release (the canvas reflects the source) and both
degrade gracefully — recoverable problems surface as a warning chip instead of
failing the whole canvas. Documented in the README and the canvas syntax
reference, and covered by unit tests plus pixel-level visual-regression
baselines.
