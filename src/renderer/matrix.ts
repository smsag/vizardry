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

/** Rect of a snapped cell as CSS percentages. */
function cellRect(at: string, cols: number, rows: number): { left: string; top: string; width: string; height: string } {
  const n = Number(at.slice(1));
  const col = ((n - 1) % cols) + 1;
  const row = Math.floor((n - 1) / cols) + 1;
  return { left: pct((col - 1) / cols), top: pct((row - 1) / rows), width: pct(1 / cols), height: pct(1 / rows) };
}

/**
 * Places all items as compact **pills** (title only). Cell-snapped (`at: tN`)
 * items flow as a wrapping chip-cloud inside their cell; free `[x, y]` items sit
 * at their point (coincident ones cascade). The description is not shown inline
 * — clicking a pill opens a popover with the details (and, in edit mode, an
 * editable field). This keeps the plane readable no matter how many items share
 * a quadrant.
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
  const popover = makePopover(area);
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

  // Cell-snapped items → a wrapping pill cloud over the cell.
  for (const [key, cellItems] of snapped) {
    const cloud = overlay.createEl("div", { cls: "vzd-mx-cell-pills" });
    const r = cellRect(key, cols, rows);
    cloud.style.left = r.left; cloud.style.top = r.top;
    cloud.style.width = r.width; cloud.style.height = r.height;
    for (const item of cellItems) {
      const pill = buildPill(item, resolver, navigateTo, app, ctx);
      cloud.appendChild(pill);
      wirePill(pill, item, area, overlay, container, editMode, popover, app, ctx, resolver, navigateTo);
    }
  }

  // Free `[x, y]` items → a pill pinned at the point (coincident ones cascade).
  const seen = new Map<string, number>();
  for (const item of free) {
    const x = item.x ?? 0.5, y = item.y ?? 0.5;
    const ck = `${x.toFixed(3)},${y.toFixed(3)}`;
    const k = seen.get(ck) ?? 0;
    seen.set(ck, k + 1);
    const wrap = overlay.createEl("div", { cls: "vzd-mx-item" });
    wrap.style.left = pct(x);
    wrap.style.top = pct(1 - y);
    if (k > 0) {
      wrap.style.transform = `translate(${k * 12}px, ${k * 12}px)`;
      wrap.style.zIndex = String(2 + k);
    }
    const pill = buildPill(item, resolver, navigateTo, app, ctx);
    wrap.appendChild(pill);
    wirePill(pill, item, area, overlay, container, editMode, popover, app, ctx, resolver, navigateTo);
  }
}

/** Builds a compact pill: the title (with its heading/ticket link) and a marker
 *  when it has a description to reveal. */
function buildPill(
  item: MatrixItem,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): HTMLElement {
  const pill = document.createElement("div");
  pill.className = "vzd-mx-pill";
  pill.setAttribute("role", "button");
  pill.tabIndex = 0;
  const labelEl = pill.createEl("span", { cls: "vzd-mx-item-label", text: item.label });
  // Link the label to a heading/ticket: explicit annotation on the item line,
  // or a heading whose name matches the label (auto-detect via the shared resolver).
  renderHeadingLink(labelEl, item.label, itemLinkResolver(item, resolver), navigateTo, app, ctx?.sourcePath);
  if (item.content.trim()) pill.classList.add("vzd-mx-pill--has-details");
  return pill;
}

/** Read: click opens the detail popover. Edit: drag repositions the item (into a
 *  free `[x, y]`), a plain click opens the popover with an editable description. */
function wirePill(
  pill: HTMLElement,
  item: MatrixItem,
  area: HTMLElement,
  overlay: HTMLElement,
  container: HTMLElement,
  editMode: boolean,
  popover: Popover,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const openDetails = (): void =>
    popover.open(pill, item, editMode && !!app && !!ctx, container, app, ctx, resolver, navigateTo);

  if (!editMode || !app || !ctx) {
    pill.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a, .vzd-card-link-btn")) return; // link handled itself
      e.stopPropagation();
      openDetails();
    });
    return;
  }

  pill.classList.add("vzd-mx-item--editable");
  pill.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a, button, textarea, .vzd-card-link-btn")) return;
    e.preventDefault();

    const startX = e.clientX, startY = e.clientY;
    const fromFreeWrap = pill.parentElement?.classList.contains("vzd-mx-item") ?? false;
    let moved = false, nx = 0.5, ny = 0.5;
    let anchor: HTMLElement | null = null;
    pill.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        popover.close();
        if (fromFreeWrap) {
          anchor = pill.parentElement as HTMLElement;
          anchor.style.transform = ""; anchor.style.zIndex = "";
          anchor.classList.add("vzd-mx-item--dragging");
        } else {
          // Pull the pill out of its cell cloud into a floating pin.
          anchor = overlay.createEl("div", { cls: "vzd-mx-item vzd-mx-item--dragging" });
          anchor.appendChild(pill);
        }
      }
      const rect = area.getBoundingClientRect();
      nx = clamp01((ev.clientX - rect.left) / rect.width);
      ny = clamp01(1 - (ev.clientY - rect.top) / rect.height);
      anchor!.style.left = pct(nx);
      anchor!.style.top = pct(1 - ny);
    };

    const onUp = (): void => {
      pill.releasePointerCapture(e.pointerId);
      pill.removeEventListener("pointermove", onMove);
      pill.removeEventListener("pointerup", onUp);
      if (moved) {
        anchor?.classList.remove("vzd-mx-item--dragging");
        item.x = nx; item.y = ny; item.at = undefined;
        if (!writeItemPosition(app, ctx, container, item.label, nx, ny)) new Notice(t("edit.writeFailed"));
      } else {
        openDetails();
      }
    };

    pill.addEventListener("pointermove", onMove);
    pill.addEventListener("pointerup", onUp);
  });
}

interface Popover {
  open: (
    pill: HTMLElement,
    item: MatrixItem,
    editMode: boolean,
    container: HTMLElement,
    app?: App,
    ctx?: MarkdownPostProcessorContext,
    resolver?: LinkResolver,
    navigateTo?: (heading: string) => void,
  ) => void;
  close: () => void;
}

/** A single-instance detail popover anchored to the clicked pill. Only one is
 *  ever open; it closes on Esc, an outside click, or another pill opening. */
function makePopover(area: HTMLElement): Popover {
  let el: HTMLElement | null = null;
  let cleanup: (() => void) | null = null;

  const close = (): void => {
    cleanup?.(); cleanup = null;
    el?.remove(); el = null;
  };

  const open: Popover["open"] = (pill, item, editMode, container, app, ctx, resolver, navigateTo) => {
    close();
    const pop = area.createEl("div", { cls: "vzd-mx-popover" });
    el = pop;

    const titleEl = pop.createEl("div", { cls: "vzd-mx-popover-title" });
    const labelEl = titleEl.createEl("span", { cls: "vzd-mx-item-label", text: item.label });
    renderHeadingLink(labelEl, item.label, itemLinkResolver(item, resolver), navigateTo, app, ctx?.sourcePath);

    const body = pop.createEl("div", { cls: "vzd-mx-popover-body vizardry-block-body" });
    if (editMode && app && ctx) {
      editPopoverBody(body, item, container, app, ctx, resolver, navigateTo);
    } else {
      renderBlockBody(body, item.content, resolver, navigateTo, app, ctx?.sourcePath);
      if (!item.content.trim()) body.remove(); // read-only + empty → title-only card
    }

    positionPopover(pop, pill, area);

    // Dismiss on outside pointerdown / Escape. Registered on the next tick so the
    // click that opened the popover doesn't immediately close it.
    const onDocPointer = (ev: Event): void => {
      const target = ev.target as Node;
      if (pop.contains(target) || pill.contains(target)) return;
      close();
    };
    const onKey = (ev: KeyboardEvent): void => { if (ev.key === "Escape") close(); };
    const doc = pill.ownerDocument;
    const timer = doc.defaultView?.setTimeout(() => doc.addEventListener("pointerdown", onDocPointer, true), 0);
    doc.addEventListener("keydown", onKey);
    cleanup = () => {
      if (timer !== undefined) doc.defaultView?.clearTimeout(timer);
      doc.removeEventListener("pointerdown", onDocPointer, true);
      doc.removeEventListener("keydown", onKey);
    };
  };

  return { open, close };
}

/** Positions the popover under the pill (flipping above when it would overflow
 *  the plane) and clamps it horizontally so it stays inside. */
function positionPopover(pop: HTMLElement, pill: HTMLElement, area: HTMLElement): void {
  const ar = area.getBoundingClientRect();
  const pr = pill.getBoundingClientRect();
  const cx = pr.left + pr.width / 2 - ar.left;
  const below = pr.bottom - ar.top + 6;

  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const clampedCx = ar.width > pw ? Math.max(pw / 2 + 4, Math.min(ar.width - pw / 2 - 4, cx)) : cx;
  pop.style.left = `${clampedCx}px`;
  pop.style.top = below + ph > ar.height && pr.top - ar.top - ph - 6 > 0
    ? `${pr.top - ar.top - ph - 6}px`
    : `${below}px`;
}

/** Replaces the popover body with an auto-growing textarea; commits the edited
 *  description on blur/Enter, reverts on Escape. */
function editPopoverBody(
  body: HTMLElement,
  item: MatrixItem,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  body.empty();
  const textarea = body.createEl("textarea", { cls: "vzd-plain-textarea vzd-block-textarea" });
  textarea.value = item.content;
  textarea.placeholder = t("matrix.item.detailsPlaceholder");
  const resize = (): void => { textarea.style.height = "auto"; textarea.style.height = `${textarea.scrollHeight}px`; };
  resize();
  textarea.addEventListener("input", resize);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;
  const finish = (write: boolean): void => {
    if (committed) return;
    committed = true;
    const newValue = textarea.value.trim();
    if (write && writeItemContent(app, ctx, container, item.label, newValue)) {
      item.content = newValue;
    } else if (write) {
      new Notice(t("edit.writeFailed"));
    }
    renderBlockBody(body, item.content, resolver, navigateTo, app, ctx.sourcePath);
  };

  textarea.addEventListener("blur", () => finish(true));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); }
  });
}
