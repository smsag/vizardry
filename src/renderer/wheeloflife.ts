import type { WheelOfLifeData, WheelOfLifeArea } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";

// Wheel geometry. The wheel is a fixed-size dartboard; the labels ring sits
// outside the rim, so the viewBox is wider than 2·R to leave room for them.
const VIEW = 560;
const CX = 280;
const CY = 280;
const R = 150;              // outer rim = score 10
const MAX_SCORE = 10;
const LABEL_R = R + 34;     // radius of the area-name ring, just outside the rim
const SCORE_R = R - 16;     // radius of the per-wedge score number, just inside
const GRID_LEVELS = [2, 4, 6, 8]; // inner reference rings (10 is the rim itself)

/** Polar (radius, angle) → cartesian point on the SVG canvas. Angle is in
 *  radians, measured clockwise from due north (−π/2), matching screen coords. */
function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

/** Path for a pie sector from the centre out to `radius`, spanning [a0, a1]. */
function sectorPath(radius: number, a0: number, a1: number): string {
  if (radius <= 0) return "";
  const p0 = polar(radius, a0);
  const p1 = polar(radius, a1);
  // Wedge spans ≤ π for any N ≥ 2, so the large-arc flag is always 0.
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ` +
    `A ${radius} ${radius} 0 ${largeArc} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

function wedgeHue(index: number, count: number): string {
  return `hsl(${Math.round((index * 360) / count)}, 62%, 55%)`;
}

function renderWedge(
  svg: SVGSVGElement,
  area: WheelOfLifeArea,
  index: number,
  count: number,
): void {
  const step = (2 * Math.PI) / count;
  const start = -Math.PI / 2 + index * step;
  const end = start + step;
  const mid = start + step / 2;
  const fillR = (area.score / MAX_SCORE) * R;

  const g = createSvgEl("g", { class: "vzd-wol-wedge" });
  g.dataset.area = area.name;

  // Filled portion — from centre out to the score radius.
  if (fillR > 0) {
    const fill = createSvgEl("path", { d: sectorPath(fillR, start, end), class: "vzd-wol-fill" });
    fill.style.fill = wedgeHue(index, count);
    g.appendChild(fill);
  }

  // Note tooltip (native SVG <title>) covering the whole wedge slot.
  const slot = createSvgEl("path", { d: sectorPath(R, start, end), class: "vzd-wol-slot" });
  if (area.note) {
    const titleEl = createSvgEl("title");
    titleEl.textContent = `${area.name}: ${area.score}/10 — ${area.note}`;
    slot.appendChild(titleEl);
  }
  g.appendChild(slot);

  // Per-wedge score number, just inside the rim along the wedge's mid-angle.
  const scorePt = polar(SCORE_R, mid);
  const scoreEl = createSvgEl("text", {
    x: scorePt.x.toFixed(2), y: scorePt.y.toFixed(2), class: "vzd-wol-score",
    "text-anchor": "middle", "dominant-baseline": "central",
  });
  scoreEl.textContent = String(area.score);
  g.appendChild(scoreEl);

  // Area name in the label ring outside the rim, anchored by quadrant.
  const labelPt = polar(LABEL_R, mid);
  const cos = Math.cos(mid);
  const anchor = cos > 0.15 ? "start" : cos < -0.15 ? "end" : "middle";
  const labelEl = createSvgEl("text", {
    x: labelPt.x.toFixed(2), y: labelPt.y.toFixed(2), class: "vzd-wol-label",
    "text-anchor": anchor, "dominant-baseline": "central",
  });
  labelEl.textContent = area.name;
  g.appendChild(labelEl);

  svg.appendChild(g);
}

export function renderWheelOfLife(
  data: WheelOfLifeData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Wheel of Life";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "wheeloflife", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const wrap = container.createEl("div", { cls: "vzd-wol-wrap" });
  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    class: "vzd-wol-svg",
    role: "img",
    "aria-label": `${title}: ${data.areas.map(a => `${a.name} ${a.score}`).join(", ")}`,
  }) as SVGSVGElement;

  const count = data.areas.length;
  const step = (2 * Math.PI) / count;

  // Filled wedges first so the reference grid and spokes sit on top of them.
  data.areas.forEach((area, i) => renderWedge(svg, area, i, count));

  // Inner reference rings.
  for (const level of GRID_LEVELS) {
    svg.appendChild(createSvgEl("circle", {
      cx: String(CX), cy: String(CY), r: String((level / MAX_SCORE) * R),
      class: "vzd-wol-ring",
    }));
  }

  // Spokes at every wedge boundary.
  for (let i = 0; i < count; i++) {
    const edge = polar(R, -Math.PI / 2 + i * step);
    svg.appendChild(createSvgEl("line", {
      x1: String(CX), y1: String(CY), x2: edge.x.toFixed(2), y2: edge.y.toFixed(2),
      class: "vzd-wol-spoke",
    }));
  }

  // Outer rim (score 10).
  svg.appendChild(createSvgEl("circle", { cx: String(CX), cy: String(CY), r: String(R), class: "vzd-wol-rim" }));

  wrap.appendChild(svg);
}
