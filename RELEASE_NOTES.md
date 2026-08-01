## 0.41.2

- **Fix: OST / SCQA-SCR swim-lane content misplaced on mobile (iOS).** Node bodies — caption, wrapped label, and chevron bullets — are now drawn as native SVG text instead of HTML inside an SVG `<foreignObject>`. iOS WebKit mispositioned foreignObject content (bullets jumping to the canvas corner, boxes appearing empty); native SVG text honours the layout on every platform, matching the plugin's other tree diagrams. Because the renderer now wraps text itself and sizes each box to that exact line count, boxes can no longer clip their own text. Bullet add/edit/delete and node rename still work (via SVG affordances and a transient input overlay).
- **Mobile: narrower swim-lane layout.** Boxes, gaps, and the lane gutter shrink on mobile to reduce horizontal scrolling.
