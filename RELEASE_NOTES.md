## 0.42.0

- **New: Assumption Map (`type: matrix, assumption`).** An importance × evidence variant of the priority matrix. Rows are importance (very high → very low), columns are evidence (none → strong); the top-left cell (important but unproven) is the riskiest — the leap-of-faith assumptions to test first.
- **New: Scenario Matrix (`type: scenario`).** A GBN/Schwartz 2×2: define two critical uncertainties as axes (`x-axis: name | low | high`, `y-axis: …`) and name the four scenario quadrants (`top-left:` … with indented detail). Quadrant detail renders as cards that can link to headings and be dragged between scenarios.
