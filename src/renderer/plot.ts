import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { MatrixData, PlotData, PlotItem } from "../types";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n/locales/en";
import { initCanvas } from "./controls";
import { renderBlockBody } from "./block-editor";
import { BASE_COLORS } from "./matrix";
import { writeItemPosition, writeItemContent } from "../shared/plot-edit";
import { isEditModeActive } from "../shared/editor";
import type { LinkResolver } from "../shared/links";

const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag, not a click
const pct = (n: number): string => `${(n * 100).toFixed(3)}%`;

/**
 * Renders a `layout: plot` matrix: a continuous scatter on two labelled axes.
 * Items are placed by (x, y) in [0, 1] (origin bottom-left); heat is declared by
 * author `zone:` rectangles, never derived. In edit mode items can be dragged
 * (writes x/y back) and clicked to edit their body.
 */
export function renderPlot(
  data: MatrixData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const plot = data.plot as PlotData;
  container.style.setProperty("--vzd-matrix-base", BASE_COLORS[data.type]);

  const hasHeat = plot.zones.some(z => z.heat);
  initCanvas(
    container,
    "matrix",
    "Plotted Matrix",
    hasHeat ? (header) => {
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
    } : undefined,
    source,
    undefined,
    app,
    ctx,
  );

  const editMode = !!(app && ctx && isEditModeActive(app));

  const wrap = container.createEl("div", { cls: "vzd-plot-wrap" });
  wrap.dataset.type = data.type;

  // Y-axis title, rotated along the left edge.
  wrap.createEl("div", { cls: "vzd-plot-yname" }).createEl("span", { text: plot.yAxis.title });

  const main = wrap.createEl("div", { cls: "vzd-plot-main" });

  // Y tick gutter (labels positioned by their 0…1 pos, top = (1 - pos)).
  const yTicks = main.createEl("div", { cls: "vzd-plot-yticks" });
  for (const tick of plot.yAxis.ticks) {
    const el = yTicks.createEl("div", { cls: "vzd-plot-tick vzd-plot-tick--y", text: tick.label });
    el.style.top = pct(1 - tick.pos);
  }

  // Plot area — zones behind, items in front.
  const area = main.createEl("div", { cls: "vzd-plot-area" });

  for (const zone of plot.zones) {
    const [x0, y0, x1, y1] = zone.rect;
    const z = area.createEl("div", { cls: "vzd-plot-zone" });
    if (zone.heat) z.classList.add(`vzd-plot-zone--${zone.heat}`);
    z.style.left = pct(Math.min(x0, x1));
    z.style.width = pct(Math.abs(x1 - x0));
    z.style.top = pct(1 - Math.max(y0, y1));
    z.style.height = pct(Math.abs(y1 - y0));
    if (zone.label) z.createEl("div", { cls: "vzd-plot-zone-label", text: zone.label });
  }

  for (const item of plot.items) {
    renderItem(item, area, container, editMode, app, ctx, resolver, navigateTo);
  }

  // X tick row (labels positioned by pos, left = pos).
  const xTicks = main.createEl("div", { cls: "vzd-plot-xticks" });
  for (const tick of plot.xAxis.ticks) {
    const el = xTicks.createEl("div", { cls: "vzd-plot-tick vzd-plot-tick--x", text: tick.label });
    el.style.left = pct(tick.pos);
  }

  wrap.createEl("div", { cls: "vzd-plot-xname", text: plot.xAxis.title });
}

function renderItem(
  item: PlotItem,
  area: HTMLElement,
  container: HTMLElement,
  editMode: boolean,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const el = area.createEl("div", { cls: "vzd-plot-item" });
  el.style.left = pct(item.x);
  el.style.top = pct(1 - item.y);
  el.createEl("div", { cls: "vzd-plot-item-dot" });
  const card = el.createEl("div", { cls: "vzd-plot-item-card" });
  card.createEl("div", { cls: "vzd-plot-item-label", text: item.label });
  const body = card.createEl("div", { cls: "vizardry-block-body" });
  renderBlockBody(body, item.content, resolver, navigateTo, app, ctx?.sourcePath);

  if (!editMode || !app || !ctx) return;
  el.classList.add("vzd-plot-item--editable");
  wireItemInteraction(el, card, body, item, area, container, app, ctx, resolver, navigateTo);
}

/** Press → drag repositions (writes x/y); a press without movement opens the
 *  body editor. Uses pointer capture so a fast drag can't outrun the element. */
function wireItemInteraction(
  el: HTMLElement,
  card: HTMLElement,
  body: HTMLElement,
  item: PlotItem,
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
    let nx = item.x;
    let ny = item.y;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      el.classList.add("vzd-plot-item--dragging");
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
      el.classList.remove("vzd-plot-item--dragging");

      if (moved) {
        item.x = nx;
        item.y = ny;
        if (!writeItemPosition(app, ctx, container, item.label, nx, ny)) {
          new Notice(t("edit.writeFailed"));
        }
      } else {
        openItemBodyEditor(card, body, item, container, app, ctx, resolver, navigateTo);
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  });
}

function openItemBodyEditor(
  card: HTMLElement,
  body: HTMLElement,
  item: PlotItem,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  if (card.hasClass("vzd-plot-item-editing")) return;
  card.addClass("vzd-plot-item-editing");
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
    card.removeClass("vzd-plot-item-editing");
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
