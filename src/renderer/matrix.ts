import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { MatrixData, MatrixItem, MatrixPreset } from "../types";
import { t } from "../i18n";
import { initCanvas, renderHeadingLink, renderCanvasWarnings } from "./controls";
import { renderBlockBody } from "./block-editor";
import { presetColor } from "../matrix-presets";
import { writeItemPosition, writeItemContent } from "../shared/matrix-edit";
import { isEditModeActive } from "../shared/editor";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { classifyTicketTarget, type LinkResolver } from "../shared/links";
import type { RenderContext } from "./render-context";

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
  rc: RenderContext = {},
): void {
  const { source, app, ctx, resolver, navigateTo } = rc;
  container.style.setProperty("--vzd-matrix-base", presetColor(data.preset));

  const cols = data.xAxis.ticks.length;
  const rows = data.yAxis.ticks.length;

  // Respect a custom `title:` line and make it click-to-edit, like every other
  // canvas — without this the Matrix always showed the preset name (e.g.
  // "Impact / Effort Matrix") and ignored the user's title.
  const defaultTitle = data.preset ? TITLES[data.preset] : "Matrix";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined && isEditModeActive(app))
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;

  initCanvas(
    container,
    "matrix",
    title,
    undefined,
    source,
    onTitleEdit,
    app,
    ctx,
  );
  renderCanvasWarnings(container, data.warnings);

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
  renderItems(data.items, overlay, area, cols, rows, container, editMode, app, ctx, resolver, navigateTo);

  // X tick bands (left → right).
  const xTicks = main.createEl("div", { cls: "vzd-mx-xticks" });
  for (let c = 0; c < cols; c++) {
    xTicks.createEl("div", { cls: "vzd-mx-tick", text: data.xAxis.ticks[c] });
  }

  wrap.createEl("div", { cls: "vzd-mx-xname", text: data.xAxis.title });
}

/** A resolver that returns the item's own explicit link annotation, falling
 *  back to the shared resolver (heading auto-detect, blind ticket enrichment). */
function itemLinkResolver(item: MatrixItem, base?: LinkResolver): LinkResolver | undefined {
  if (!item.linkHeading && !item.linkTicket) return base;
  return {
    resolve: (l) => item.linkHeading ?? base?.resolve(l),
    resolveTicket: (l) => (item.linkTicket ? classifyTicketTarget(item.linkTicket) ?? undefined : base?.resolveTicket?.(l)),
  };
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Centre of a snapped cell, in plane coords (0…1, origin bottom-left). */
function cellCenter(at: string, cols: number, rows: number): { x: number; y: number } {
  const n = Number(at.slice(1));
  const col = ((n - 1) % cols) + 1;
  const row = Math.floor((n - 1) / cols) + 1; // 1 = top
  return { x: (col - 0.5) / cols, y: 1 - (row - 0.5) / rows };
}

/** Rect of a snapped cell as CSS percentages. */
function cellRect(at: string, cols: number, rows: number): { left: string; top: string; width: string; height: string } {
  const n = Number(at.slice(1));
  const col = ((n - 1) % cols) + 1;
  const row = Math.floor((n - 1) / cols) + 1;
  return { left: pct((col - 1) / cols), top: pct((row - 1) / rows), width: pct(1 / cols), height: pct(1 / rows) };
}

/**
 * Places all items. When two or more items are snapped to the same cell they
 * stack inside it (Option A) instead of piling up at the centre and becoming
 * unreadable; a lone cell item and free `[x, y]` items keep the floating pin.
 * Free items that resolve to the same point cascade so their cards stay
 * readable (Option B).
 */
function renderItems(
  items: MatrixItem[],
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
  const snapped = new Map<string, MatrixItem[]>();
  const free: MatrixItem[] = [];
  for (const item of items) {
    if (item.at && cols > 0 && rows > 0) {
      const key = item.at.toLowerCase();
      const arr = snapped.get(key);
      if (arr) arr.push(item); else snapped.set(key, [item]);
    } else {
      free.push(item);
    }
  }

  for (const [key, cellItems] of snapped) {
    // A single item keeps the classic centred pin (existing matrices unchanged).
    if (cellItems.length === 1) {
      const { x, y } = cellCenter(key, cols, rows);
      renderFreeItem(cellItems[0], x, y, 0, overlay, area, container, editMode, app, ctx, resolver, navigateTo);
      continue;
    }
    const stack = overlay.createEl("div", { cls: "vzd-mx-cell-stack" });
    const r = cellRect(key, cols, rows);
    stack.style.left = r.left; stack.style.top = r.top;
    stack.style.width = r.width; stack.style.height = r.height;
    for (const item of cellItems) {
      const { card, body } = buildItemCard(item, resolver, navigateTo, app, ctx);
      card.classList.add("vzd-mx-item-card--stacked");
      stack.appendChild(card);
      if (editMode && app && ctx) {
        card.classList.add("vzd-mx-item--editable");
        wireStackedCard(card, body, item, area, overlay, container, app, ctx, resolver, navigateTo);
      }
    }
  }

  const seen = new Map<string, number>();
  for (const item of free) {
    const x = item.x ?? 0.5, y = item.y ?? 0.5;
    const ck = `${x.toFixed(3)},${y.toFixed(3)}`;
    const k = seen.get(ck) ?? 0;
    seen.set(ck, k + 1);
    renderFreeItem(item, x, y, k, overlay, area, container, editMode, app, ctx, resolver, navigateTo);
  }
}

/** Builds an item's card (label + link + body). Shared by pins and stacks. */
function buildItemCard(
  item: MatrixItem,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): { card: HTMLElement; body: HTMLElement } {
  const card = document.createElement("div");
  card.className = "vzd-mx-item-card";
  const labelEl = card.createEl("div", { cls: "vzd-mx-item-label", text: item.label });
  // Link the label to a heading/ticket: explicit annotation on the item line,
  // or a heading whose name matches the label (auto-detect via the shared resolver).
  renderHeadingLink(labelEl, item.label, itemLinkResolver(item, resolver), navigateTo, app, ctx?.sourcePath);
  const body = card.createEl("div", { cls: "vizardry-block-body" });
  renderBlockBody(body, item.content, resolver, navigateTo, app, ctx?.sourcePath);
  return { card, body };
}

/** A floating pin (dot + card) at plane coords; `collision` cascades coincident items. */
function renderFreeItem(
  item: MatrixItem,
  x: number,
  y: number,
  collision: number,
  overlay: HTMLElement,
  area: HTMLElement,
  container: HTMLElement,
  editMode: boolean,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const el = overlay.createEl("div", { cls: "vzd-mx-item" });
  el.style.left = pct(x);
  el.style.top = pct(1 - y);
  if (collision > 0) {
    el.style.transform = `translate(${collision * 12}px, ${collision * 12}px)`;
    el.style.zIndex = String(2 + collision);
  }
  el.createEl("div", { cls: "vzd-mx-item-dot" });
  const { card, body } = buildItemCard(item, resolver, navigateTo, app, ctx);
  el.appendChild(card);

  if (!editMode || !app || !ctx) return;
  el.classList.add("vzd-mx-item--editable");
  wireItem(el, card, body, item, area, container, app, ctx, resolver, navigateTo);
}

/** Drag/edit for a card inside a cell stack: dragging pulls it out into a
 *  floating pin (converting it to a free `[x, y]`); a click edits its body. */
function wireStackedCard(
  card: HTMLElement,
  body: HTMLElement,
  item: MatrixItem,
  area: HTMLElement,
  overlay: HTMLElement,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a, button, textarea")) return;
    e.preventDefault();

    const startX = e.clientX, startY = e.clientY;
    let moved = false, nx = 0.5, ny = 0.5;
    let anchor: HTMLElement | null = null;
    card.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        // Pull the card out of the stack into a floating pin that follows the pointer.
        anchor = overlay.createEl("div", { cls: "vzd-mx-item vzd-mx-item--editable vzd-mx-item--dragging" });
        anchor.createEl("div", { cls: "vzd-mx-item-dot" });
        card.classList.remove("vzd-mx-item-card--stacked");
        anchor.appendChild(card);
      }
      const rect = area.getBoundingClientRect();
      nx = clamp01((ev.clientX - rect.left) / rect.width);
      ny = clamp01(1 - (ev.clientY - rect.top) / rect.height);
      anchor!.style.left = pct(nx);
      anchor!.style.top = pct(1 - ny);
    };

    const onUp = (): void => {
      card.releasePointerCapture(e.pointerId);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerup", onUp);
      if (moved) {
        item.x = nx; item.y = ny; item.at = undefined;
        if (!writeItemPosition(app, ctx, container, item.label, nx, ny)) new Notice(t("edit.writeFailed"));
      } else {
        openItemEditor(card, body, item, container, app, ctx, resolver, navigateTo);
      }
    };

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
  });
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
