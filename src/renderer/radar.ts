import type { RadarData } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";

// Square viewBox in percentage units; the radar sits in the middle and the
// statement labels use the surrounding margin (so R is well under 50).
const VIEW = 100;
const C = 50;
const R = 29;               // rim = score 10
const MAX_SCORE = 10;
const LABEL_R = R + 4;      // radius of the statement labels, just outside the rim
const GRID_LEVELS = [2, 4, 6, 8];

/** Point on axis `index` of `count` at 0–10 `score` (0 = centre, 10 = rim). */
function point(index: number, count: number, score: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const r = (score / MAX_SCORE) * R;
  return { x: C + r * Math.cos(angle), y: C + r * Math.sin(angle) };
}

function axisAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

export function renderRadar(
  data: RadarData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Radar Chart";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "radar", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const wrap = container.createEl("div", { cls: "vzd-radar-wrap" });
  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    class: "vzd-radar-svg",
    role: "img",
    "aria-label": `${title}: ${data.axes.map(a => `${a.label} ${a.score}`).join(", ")}`,
  }) as SVGSVGElement;

  const n = data.axes.length;

  // Concentric scale rings + outer rim.
  for (const level of GRID_LEVELS) {
    svg.appendChild(createSvgEl("circle", { cx: String(C), cy: String(C), r: String((level / MAX_SCORE) * R), class: "vzd-radar-ring" }));
  }
  svg.appendChild(createSvgEl("circle", { cx: String(C), cy: String(C), r: String(R), class: "vzd-radar-rim" }));

  // Spokes.
  for (let i = 0; i < n; i++) {
    const edge = point(i, n, MAX_SCORE);
    svg.appendChild(createSvgEl("line", { x1: String(C), y1: String(C), x2: edge.x.toFixed(2), y2: edge.y.toFixed(2), class: "vzd-radar-spoke" }));
  }

  // Filled score polygon.
  const pts = data.axes.map((a, i) => point(i, n, a.score));
  svg.appendChild(createSvgEl("polygon", {
    points: pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
    class: "vzd-radar-area",
  }));
  // Vertex dots.
  for (const p of pts) {
    svg.appendChild(createSvgEl("circle", { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: "0.9", class: "vzd-radar-dot" }));
  }

  wrap.appendChild(svg);

  // Statement labels positioned around the rim, each anchored to grow outward.
  data.axes.forEach((axis, i) => {
    const angle = axisAngle(i, n);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const lx = C + LABEL_R * cos;
    const ly = C + LABEL_R * sin;
    const tx = cos > 0.25 ? "0" : cos < -0.25 ? "-100%" : "-50%";
    const ty = sin > 0.25 ? "0" : sin < -0.25 ? "-100%" : "-50%";
    const label = wrap.createEl("div", { cls: "vzd-radar-label" });
    label.style.left = `${lx}%`;
    label.style.top = `${ly}%`;
    label.style.transform = `translate(${tx}, ${ty})`;
    label.style.textAlign = cos > 0.25 ? "left" : cos < -0.25 ? "right" : "center";
    label.createEl("span", { cls: "vzd-radar-num", text: `${i + 1}.` });
    label.createEl("span", { cls: "vzd-radar-stmt", text: ` ${axis.label}` });
  });
}
