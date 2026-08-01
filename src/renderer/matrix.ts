import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { MatrixData, MatrixItem, MatrixPreset } from "../types";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n/locales/en";
import { initCanvas } from "./controls";
import { renderBlockBody } from "./block-editor";
import { presetColor } from "../matrix-presets";
import { writeItemPosition, writeItemContent } from "../shared/matrix-edit";
import { isEditModeActive } from "../shared/editor";
import type { LinkResolver } from "../shared/links";

const DRAG_THRESHOLD = 4;
const pct = (n: number): string => `${(n * 100).toFixed(3)}%`;

const TITLES: Record<MatrixPreset, string> = {
  pain: "Pain Point Matrix",
  opportunity: "Opportunity Matrix",
  impact: "Impact / Effort Matrix",
  assumption: "Assumption Map",
  scenario: "Scenario Matrix",
};

/**
 * The one matrix renderer: two tick-labelled axes form an N×M cell grid (tinted
 * by heat, optionally named); items are cards placed at a free `[x, y]`
 * coordinate or snapped to a cell centre. In edit mode items drag to reposition
 * (writing `[x, y]` back) and click to edit their body.
 */
export function renderMatrix(
  data: MatrixData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  container.style.setProperty("--vzd-matrix-base", presetColor(data.preset));

  const cols = data.xAxis.ticks.length;
  const rows = data.yAxis.ticks.length;
  const hasHeat = data.cells.some(c => c.heat);

  initCanvas(
    container,
    "matrix",
    data.preset ? TITLES[data.preset] : "Matrix",
    hasHeat ? (header) => renderLegend(header) : undefined,
    source,
    undefined,
    app,
    ctx,
  );

  const editMode = !!(app && ctx && isEditModeActive(app));

  const wrap = container.createEl("div", { cls: "vzd-mx-wrap" });
  if (data.preset) wrap.dataset.preset = data.preset;

  wrap.createEl("div", { cls: "vzd-mx-yname" }).createEl("span", { text: data.yAxis.title });

  const main = wrap.createEl("div", { cls: "vzd-mx-main" });

  // Y tick bands (top → bottom in the DOM; data ticks are bottom → top).
  const yTicks = main.createEl("div", { cls: "vzd-mx-yticks" });
  for (let r = rows - 1; r >= 0; r--) {
    yTicks.createEl("div", { cls: "vzd-mx-tick", text: data.yAxis.ticks[r] });
  }

  const area = main.createEl("div", { cls: "vzd-mx-area" });

  // Cell grid background (reading order: top row first).
  const grid = area.createEl("div", { cls: "vzd-mx-cells" });
  if (cols > 0 && rows > 0) {
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    for (const cell of data.cells) {
      const el = grid.createEl("div", { cls: "vzd-mx-cell" });
      if (cell.heat) el.classList.add(`vzd-mx-cell--${cell.heat}`);
      if (cell.name) el.createEl("div", { cls: "vzd-mx-cell-name", text: cell.name });
    }
  }

  // Item overlay.
  const overlay = area.createEl("div", { cls: "vzd-mx-items" });
  for (const item of data.items) {
    renderItem(item, overlay, area, cols, rows, container, editMode, app, ctx, resolver, navigateTo);
  }

  // X tick bands (left → right).
  const xTicks = main.createEl("div", { cls: "vzd-mx-xticks" });
  for (let c = 0; c < cols; c++) {
    xTicks.createEl("div", { cls: "vzd-mx-tick", text: data.xAxis.ticks[c] });
  }

  wrap.createEl("div", { cls: "vzd-mx-xname", text: data.xAxis.title });
}

function renderLegend(header: HTMLElement): void {
  const actionsDiv = header.querySelector(".vizardry-header-actions");
  const legend = header.createEl("div", { cls: "vzd-matrix-legend" });
  const levels: Array<{ key: TranslationKey; cls: string }> = [
    { key: "matrix.legend.veryHigh", cls: "vzd-matrix-legend-pill--very-high" },
    { key: "matrix.legend.high",     cls: "vzd-matrix-legend-pill--high" },
    { key: "matrix.legend.medium",   cls: "vzd-matrix-legend-pill--medium" },
    { key: "matrix.legend.low",      cls: "vzd-matrix-legend-pill--low" },
  ];
  for (const { key, cls } of levels) {
    legend.createEl("span", { cls: `vzd-matrix-legend-pill ${cls}`, text: t(key) });
  }
  if (actionsDiv) header.insertBefore(legend, actionsDiv);
}

/** Resolves an item's position to plane coordinates (0…1, origin bottom-left). */
function itemXY(item: MatrixItem, cols: number, rows: number): { x: number; y: number } {
  if (item.at && cols > 0 && rows > 0) {
    const n = Number(item.at.slice(1));
    const col = ((n - 1) % cols) + 1;
    const row = Math.floor((n - 1) / cols) + 1; // 1 = top
    return { x: (col - 0.5) / cols, y: 1 - (row - 0.5) / rows };
  }
  return { x: item.x ?? 0.5, y: item.y ?? 0.5 };
}

function renderItem(
  item: MatrixItem,
  overlay: HTMLElement,
  area: HTMLElement,
  cols: number,
  rows: number,
  container: HTMLElement,
  editMode: boolean,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const { x, y } = itemXY(item, cols, rows);
  const el = overlay.createEl("div", { cls: "vzd-mx-item" });
  el.style.left = pct(x);
  el.style.top = pct(1 - y);
  el.createEl("div", { cls: "vzd-mx-item-dot" });
  const card = el.createEl("div", { cls: "vzd-mx-item-card" });
  card.createEl("div", { cls: "vzd-mx-item-label", text: item.label });
  const body = card.createEl("div", { cls: "vizardry-block-body" });
  renderBlockBody(body, item.content, resolver, navigateTo, app, ctx?.sourcePath);

  if (!editMode || !app || !ctx) return;
  el.classList.add("vzd-mx-item--editable");
  wireItem(el, card, body, item, area, container, app, ctx, resolver, navigateTo);
}

function wireItem(
  el: HTMLElement,
  card: HTMLElement,
  body: HTMLElement,
  item: MatrixItem,
  area: HTMLElement,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a, button, textarea")) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let nx = 0.5;
    let ny = 0.5;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      el.classList.add("vzd-mx-item--dragging");
      const rect = area.getBoundingClientRect();
      nx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      ny = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
      el.style.left = pct(nx);
      el.style.top = pct(1 - ny);
    };

    const onUp = (): void => {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.classList.remove("vzd-mx-item--dragging");
      if (moved) {
        item.x = nx; item.y = ny; item.at = undefined;
        if (!writeItemPosition(app, ctx, container, item.label, nx, ny)) new Notice(t("edit.writeFailed"));
      } else {
        openItemEditor(card, body, item, container, app, ctx, resolver, navigateTo);
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  });
}

function openItemEditor(
  card: HTMLElement,
  body: HTMLElement,
  item: MatrixItem,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  if (card.hasClass("vzd-mx-item-editing")) return;
  card.addClass("vzd-mx-item-editing");
  body.empty();

  const textarea = body.createEl("textarea", { cls: "vzd-plain-textarea vzd-block-textarea" });
  textarea.value = item.content;
  const resize = (): void => { textarea.style.height = "auto"; textarea.style.height = `${textarea.scrollHeight}px`; };
  resize();
  textarea.addEventListener("input", resize);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;
  const finish = (write: boolean): void => {
    if (committed) return;
    committed = true;
    card.removeClass("vzd-mx-item-editing");
    const newValue = textarea.value.trim();
    if (write && writeItemContent(app, ctx, container, item.label, newValue)) {
      item.content = newValue;
      renderBlockBody(body, newValue, resolver, navigateTo, app, ctx.sourcePath);
    } else {
      if (write) new Notice(t("edit.writeFailed"));
      renderBlockBody(body, item.content, resolver, navigateTo, app, ctx.sourcePath);
    }
  };

  textarea.addEventListener("blur", () => finish(true));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
}
