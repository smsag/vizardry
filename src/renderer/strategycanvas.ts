import type { StrategyCanvasData } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { harmonizedAccentColor } from "../shared/accent-colors";

// Wide viewBox. The plot rectangle leaves a left gutter for the Low→High scale
// and a bottom band for the (HTML) factor labels, which overlay the wrap.
const VW = 100;
const VH = 62;
const X0 = 7;          // left edge of plot (score axis gutter)
const X1 = 98;         // right edge of plot
const Y_TOP = 4;       // score 10
const Y_BOT = 48;      // score 0 (the 48→62 band holds the HTML factor labels)
const MAX_SCORE = 10;
const GRID = [0, 2, 4, 6, 8, 10];

const xFor = (i: number, n: number): number => n <= 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (n - 1);
const yFor = (score: number): number => Y_BOT - (score / MAX_SCORE) * (Y_BOT - Y_TOP);

export function renderStrategyCanvas(
  data: StrategyCanvasData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Strategy Canvas";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "strategycanvas", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const seriesCount = data.series.length;
  const nf = data.factors.length;
  const color = (s: number): string => harmonizedAccentColor(s, seriesCount);

  // Legend — one chip per value curve.
  const legend = container.createEl("div", { cls: "vzd-strategy-legend" });
  data.series.forEach((name, s) => {
    const chip = legend.createEl("span", { cls: "vzd-strategy-legend-item" });
    const dot = chip.createEl("span", { cls: "vzd-strategy-legend-dot" });
    dot.style.background = color(s);
    chip.createEl("span", { text: name });
  });

  const wrap = container.createEl("div", { cls: "vzd-strategy-wrap" });
  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${VW} ${VH}`,
    class: "vzd-strategy-svg",
    role: "img",
    "aria-label": `${title}: ${data.series.join(", ")} plotted across ${data.factors.map(f => f.label).join(", ")}`,
  }) as SVGSVGElement;

  // Horizontal score gridlines + numeric ticks in the left gutter.
  for (const level of GRID) {
    const y = yFor(level);
    svg.appendChild(createSvgEl("line", {
      x1: String(X0), y1: y.toFixed(2), x2: String(X1), y2: y.toFixed(2),
      class: level === 0 ? "vzd-strategy-axis" : "vzd-strategy-grid",
    }));
    svg.appendChild(createSvgEl("text", {
      x: String(X0 - 1.5), y: (y + 1).toFixed(2), class: "vzd-strategy-tick", "text-anchor": "end",
    })).textContent = String(level);
  }
  // Low / High markers on the score axis.
  const lowHigh = (text: string, y: number): void => {
    const el = createSvgEl("text", { x: "1", y: y.toFixed(2), class: "vzd-strategy-axis-label" });
    el.textContent = text;
    svg.appendChild(el);
  };
  lowHigh("High", Y_TOP - 1);
  lowHigh("Low", Y_BOT + 3);

  // Faint vertical guide at each factor.
  for (let i = 0; i < nf; i++) {
    const x = xFor(i, nf);
    svg.appendChild(createSvgEl("line", {
      x1: x.toFixed(2), y1: String(Y_TOP), x2: x.toFixed(2), y2: String(Y_BOT), class: "vzd-strategy-guide",
    }));
  }

  // One value curve per series (skipping gaps), drawn accent-first.
  for (let s = 0; s < seriesCount; s++) {
    const pts: { x: number; y: number }[] = [];
    data.factors.forEach((f, i) => {
      const score = f.scores[s];
      if (score === null) return;
      pts.push({ x: xFor(i, nf), y: yFor(score) });
    });
    if (pts.length === 0) continue;

    if (pts.length >= 2) {
      const line = createSvgEl("polyline", {
        points: pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
        class: "vzd-strategy-line",
      });
      line.style.stroke = color(s);
      svg.appendChild(line);
    }
    for (const p of pts) {
      const dot = createSvgEl("circle", { cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: "0.85", class: "vzd-strategy-dot" });
      dot.style.fill = color(s);
      svg.appendChild(dot);
    }
  }

  wrap.appendChild(svg);

  // Factor labels along the bottom, one under each point (HTML overlay so long
  // labels wrap; SVG text would clip).
  data.factors.forEach((f, i) => {
    const x = xFor(i, nf);
    const label = wrap.createEl("div", { cls: "vzd-strategy-factor", text: f.label });
    label.style.left = `${x}%`;
    label.style.top = `${(Y_BOT / VH) * 100 + 2}%`;
    label.style.maxWidth = `${Math.max(12, (X1 - X0) / Math.max(1, nf - 1))}%`;
  });
}
