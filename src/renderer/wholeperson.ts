import type { WholePersonData, WholePersonDimension, WholePersonEntry } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";

const MAX_SCORE = 10;
const VIEW = 320;
const CX = 160;
const CY = 160;
const R = 112;
const LABEL_R = R + 22;
const SCORE_R = R - 15;
const GRID_LEVELS = [2, 4, 6, 8];

interface DimMeta { label: string; sub: string; hue: number }
const DIM_META: Record<WholePersonDimension, DimMeta> = {
  body:   { label: "Body",   sub: "Physical",           hue: 145 },
  mind:   { label: "Mind",   sub: "Mental",             hue: 210 },
  heart:  { label: "Heart",  sub: "Social / Emotional", hue: 350 },
  spirit: { label: "Spirit", sub: "Spiritual",          hue: 280 },
};

function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

function sectorPath(radius: number, a0: number, a1: number): string {
  if (radius <= 0) return "";
  const p0 = polar(radius, a0);
  const p1 = polar(radius, a1);
  return `M ${CX} ${CY} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

function renderWedge(svg: SVGSVGElement, entry: WholePersonEntry, index: number): void {
  const meta = DIM_META[entry.dimension];
  const step = Math.PI / 2; // four fixed 90° quadrants
  const start = -Math.PI / 2 + index * step;
  const mid = start + step / 2;
  const fillR = (entry.score / MAX_SCORE) * R;

  if (fillR > 0) {
    const fill = createSvgEl("path", { d: sectorPath(fillR, start, start + step), class: "vzd-wp-fill" });
    fill.style.fill = `hsl(${meta.hue}, 60%, 55%)`;
    svg.appendChild(fill);
  }

  const scorePt = polar(SCORE_R, mid);
  const score = createSvgEl("text", {
    x: scorePt.x.toFixed(2), y: scorePt.y.toFixed(2), class: "vzd-wp-score",
    "text-anchor": "middle", "dominant-baseline": "central",
  });
  score.textContent = String(entry.score);
  svg.appendChild(score);

  const labelPt = polar(LABEL_R, mid);
  const cos = Math.cos(mid);
  const label = createSvgEl("text", {
    x: labelPt.x.toFixed(2), y: labelPt.y.toFixed(2), class: "vzd-wp-wheel-label",
    "text-anchor": cos > 0.15 ? "start" : cos < -0.15 ? "end" : "middle", "dominant-baseline": "central",
  });
  label.textContent = meta.label;
  svg.appendChild(label);
}

function renderWheel(host: HTMLElement, entries: WholePersonEntry[], title: string): void {
  const wheel = host.createEl("div", { cls: "vzd-wp-wheel" });
  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${VIEW} ${VIEW}`, class: "vzd-wp-wheel-svg", role: "img",
    "aria-label": `${title}: ${entries.map(e => `${DIM_META[e.dimension].label} ${e.score}`).join(", ")}`,
  }) as SVGSVGElement;

  entries.forEach((e, i) => renderWedge(svg, e, i));

  for (const level of GRID_LEVELS) {
    svg.appendChild(createSvgEl("circle", { cx: String(CX), cy: String(CY), r: String((level / MAX_SCORE) * R), class: "vzd-wp-ring" }));
  }
  for (let i = 0; i < 4; i++) {
    const edge = polar(R, -Math.PI / 2 + i * (Math.PI / 2));
    svg.appendChild(createSvgEl("line", { x1: String(CX), y1: String(CY), x2: edge.x.toFixed(2), y2: edge.y.toFixed(2), class: "vzd-wp-spoke" }));
  }
  svg.appendChild(createSvgEl("circle", { cx: String(CX), cy: String(CY), r: String(R), class: "vzd-wp-rim" }));

  wheel.appendChild(svg);
}

function renderCards(host: HTMLElement, entries: WholePersonEntry[]): void {
  const grid = host.createEl("div", { cls: "vzd-wp-cards" });
  for (const entry of entries) {
    const meta = DIM_META[entry.dimension];
    const card = grid.createEl("div", { cls: "vzd-wp-card" });
    card.style.setProperty("--vzd-wp-hue", String(meta.hue));

    const header = card.createEl("div", { cls: "vzd-wp-card-header" });
    header.createEl("span", { cls: "vzd-wp-card-dot" });
    header.createEl("span", { cls: "vzd-wp-card-name", text: meta.label });
    header.createEl("span", { cls: "vzd-wp-card-score", text: `${entry.score}/10` });

    card.createEl("div", { cls: "vzd-wp-card-sub", text: meta.sub });

    if (entry.activities.length > 0) {
      const list = card.createEl("ul", { cls: "vzd-wp-card-activities" });
      for (const a of entry.activities) list.createEl("li", { text: a });
    }
  }
}

export function renderWholePerson(
  data: WholePersonData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Whole Person";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "wholeperson", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const wrap = container.createEl("div", { cls: "vzd-wp-wrap" });
  renderWheel(wrap, data.entries, title);
  renderCards(wrap, data.entries);
}
