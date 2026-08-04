import type { OdysseyData, OdysseyGauge, OdysseyPlan } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { setupSlideCarousel } from "./grid-carousel";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { t } from "../i18n";

// Distinct but calm per-plan accent hues (blue · green · purple · amber).
const PLAN_HUES = [210, 145, 280, 35];

const GAUGE_MAX = 10;

// Fuel-gauge dial geometry (semicircle, left = 0 → right = 10).
const G_VIEW_W = 80;
const G_VIEW_H = 50;
const G_CX = 40;
const G_CY = 42;
const G_R = 30;

/** Point on the gauge's upper semicircle for a 0–10 value (0 = left, 10 = right). */
function gaugePoint(value: number): { x: number; y: number } {
  const theta = Math.PI * (1 - value / GAUGE_MAX);
  return { x: G_CX + G_R * Math.cos(theta), y: G_CY - G_R * Math.sin(theta) };
}

/** SVG arc path from the left end (value 0) clockwise over the top to `value`. */
function gaugeArc(value: number): string {
  const from = gaugePoint(0);
  const to = gaugePoint(value);
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${G_R} ${G_R} 0 0 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

function renderGauge(host: HTMLElement, gauge: OdysseyGauge): void {
  const cell = host.createEl("div", { cls: "vzd-odyssey-gauge" });
  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${G_VIEW_W} ${G_VIEW_H}`,
    class: "vzd-odyssey-gauge-svg",
    role: "img",
    "aria-label": `${gauge.name}: ${gauge.value} out of 10`,
  });

  svg.appendChild(createSvgEl("path", { d: gaugeArc(GAUGE_MAX), class: "vzd-odyssey-gauge-track" }));
  const value = createSvgEl("path", { d: gaugeArc(gauge.value), class: "vzd-odyssey-gauge-value" });
  // Low → red, high → green, so the dashboard reads at a glance.
  value.style.stroke = `hsl(${Math.round((gauge.value / GAUGE_MAX) * 120)}, 65%, 46%)`;
  svg.appendChild(value);

  const num = createSvgEl("text", {
    x: String(G_CX), y: String(G_CY - 2), class: "vzd-odyssey-gauge-num",
    "text-anchor": "middle", "dominant-baseline": "auto",
  });
  num.textContent = String(gauge.value);
  svg.appendChild(num);

  cell.appendChild(svg);
  cell.createEl("div", { cls: "vzd-odyssey-gauge-name", text: gauge.name });
}

function renderPlan(grid: HTMLElement, plan: OdysseyPlan, index: number): void {
  const col = grid.createEl("div", { cls: "vzd-odyssey-plan" });
  col.dataset.planIndex = String(index);
  const hue = PLAN_HUES[index % PLAN_HUES.length];
  col.style.setProperty("--vzd-odyssey-hue", String(hue));

  const header = col.createEl("div", { cls: "vzd-odyssey-plan-header" });
  header.createEl("span", { cls: "vzd-odyssey-plan-label", text: plan.label });
  const titleWrap = header.createEl("div", { cls: "vzd-odyssey-plan-titles" });
  titleWrap.createEl("div", { cls: "vzd-odyssey-plan-title", text: plan.title });
  if (plan.archetype) {
    titleWrap.createEl("div", { cls: "vzd-odyssey-plan-archetype", text: plan.archetype });
  }

  if (plan.milestones.length > 0) {
    const timeline = col.createEl("div", { cls: "vzd-odyssey-timeline" });
    for (const m of plan.milestones) {
      const row = timeline.createEl("div", { cls: "vzd-odyssey-milestone" });
      row.createEl("span", { cls: "vzd-odyssey-year-badge", text: `Y${m.year}` });
      row.createEl("div", { cls: "vzd-odyssey-milestone-text", text: m.text });
    }
  }

  if (plan.gauges.length > 0) {
    const gauges = col.createEl("div", { cls: "vzd-odyssey-gauges" });
    for (const g of plan.gauges) renderGauge(gauges, g);
  }

  if (plan.questions.length > 0) {
    const qWrap = col.createEl("div", { cls: "vzd-odyssey-questions" });
    qWrap.createEl("div", { cls: "vzd-odyssey-questions-heading", text: t("odyssey.questions") });
    const ul = qWrap.createEl("ul");
    for (const q of plan.questions) ul.createEl("li", { text: q });
  }
}

export function renderOdyssey(
  data: OdysseyData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Odyssey of Life";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "odyssey", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const grid = container.createEl("div", { cls: "vzd-odyssey-grid" });
  grid.style.setProperty("--vzd-odyssey-cols", String(data.plans.length));

  data.plans.forEach((plan, i) => renderPlan(grid, plan, i));

  setupSlideCarousel(container, ".vzd-odyssey-plan", "vzd-odyssey-plan--active", data.plans.length);
}
