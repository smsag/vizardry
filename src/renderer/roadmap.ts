import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import type { RoadmapColumn, RoadmapData, RoadmapItem } from "../types";
import { initCanvas, markInteractive } from "./controls";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { enableDragGesture, preserveScroll } from "../shared/drag-gesture";
import { attachSectionPreview } from "./section-preview";
import { setupRoadmapCarousel } from "./grid-carousel";
import { t } from "../i18n";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { addRoadmapItem, renameRoadmapItem, moveRoadmapItem } from "../shared/roadmap-edit";
import { type LinkResolver, NULL_RESOLVER } from "../shared/links";
import { bestTextColor } from "../shared/color-utils";

const COL_LABELS: Record<string, string> = {
  now:   "roadmap.col.now",
  next:  "roadmap.col.next",
  later: "roadmap.col.later",
};

export function renderRoadmap(
  data: RoadmapData,
  container: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const isEditMode = !!(app && ctx && source !== undefined)
    && app.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";
  const defaultTitle = "Now/Next/Later Roadmap";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;

  initCanvas(container, "roadmap", title, undefined, source, onTitleEdit, app);
  const doc = container.ownerDocument;
  const win = ownerWindow(container);

  const grid = container.createEl("div", { cls: "vzd-roadmap-grid" });

  // ── Inline-edit helper ────────────────────────────────────────────────────
  function activateInlineEdit(
    el: HTMLElement,
    currentValue: string,
    onCommit: (newValue: string) => void,
  ): void {
    if (el.classList.contains("vzd-editing")) return;
    el.classList.add("vzd-editing");
    // Preserve rendered HTML (e.g. wiki-links) so we can restore it on cancel.
    const savedHTML = el.innerHTML;
    el.textContent = "";
    const input = el.createEl("input", { cls: "vzd-inline-input", type: "text" });
    input.value = currentValue;
    // Guard against CM6/Live-Preview immediately stealing focus back and
    // triggering an unintended commit. Ignore the first blur that fires
    // within 150 ms of the focus call.
    let blurGuarded = true;
    const blurGuardTimer = setTimeout(() => { blurGuarded = false; }, 150);
    input.focus({ preventScroll: true });
    input.select();
    let committed = false;
    const commit = (): void => {
      if (committed) return;
      committed = true;
      clearTimeout(blurGuardTimer);
      el.classList.remove("vzd-editing");
      const v = input.value.trim();
      if (v && v !== currentValue) {
        onCommit(v);
        el.textContent = v; // Temporary; canvas re-renders once the source changes.
      } else {
        el.innerHTML = savedHTML; // Restore rendered content (links etc.) on no-change.
      }
    };
    const cancel = (): void => {
      if (committed) return;
      committed = true;
      clearTimeout(blurGuardTimer);
      el.classList.remove("vzd-editing");
      el.innerHTML = savedHTML; // Restore rendered content on Escape.
    };
    input.addEventListener("blur", () => { if (!blurGuarded) commit(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
  }

  // ── Drag state ────────────────────────────────────────────────────────────
  type DragState = {
    card: HTMLElement;
    fromColId: string;
    fromIndex: number;
    ghost: HTMLElement;
    placeholder: HTMLElement;
    toColId: string;
    toIndex: number;
    overGrid: boolean;
  };
  let drag: DragState | null = null;

  function endDrag(): void {
    if (!drag) return;
    const { card, fromColId, fromIndex, ghost, placeholder, toColId, toIndex, overGrid } = drag;
    drag = null;

    ghost.remove();
    placeholder.remove();
    card.classList.remove("vzd-roadmap-card--hidden");

    if (!app || !ctx || !overGrid) return;

    preserveScroll(win, () => {
      if (fromColId !== toColId || fromIndex !== toIndex) {
        moveRoadmapItem(app, ctx, container, fromColId, fromIndex, toColId, toIndex);
      }
    });
  }

  function findDropTarget(clientX: number, clientY: number): { list: HTMLElement; colId: string; index: number } | null {
    const els = doc.elementsFromPoint(clientX, clientY);
    let list = els.find(e => e.classList.contains("vzd-roadmap-card-list")) as HTMLElement | undefined;
    if (!list) {
      // Also accept dropping on a column header
      const col = els.find(e => e.classList.contains("vzd-roadmap-col")) as HTMLElement | undefined;
      if (col) {
        list = col.querySelector<HTMLElement>(".vzd-roadmap-card-list") ?? undefined;
      }
    }
    if (!list) return null;

    const colEl = list.closest<HTMLElement>(".vzd-roadmap-col");
    const colId = colEl?.dataset.colId ?? "";

    const cards = Array.from(list.querySelectorAll<HTMLElement>(
      ".vzd-roadmap-card:not(.vzd-roadmap-card--ghost):not(.vzd-roadmap-card--placeholder):not(.vzd-roadmap-card--hidden)"
    ));
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { index = i; break; }
    }

    return { list, colId, index };
  }

  function updateDragPosition(clientX: number, clientY: number): void {
    if (!drag) return;
    drag.ghost.style.left = `${clientX + 8}px`;
    drag.ghost.style.top = `${clientY + 8}px`;

    const target = findDropTarget(clientX, clientY);
    if (!target) {
      // Only cancel the drop when the cursor leaves the grid bounds entirely.
      // Do NOT clear overGrid for cursor positions inside the grid (e.g. the
      // gap between columns) — that would silently cancel a valid cross-column
      // move when the user passes through the narrow gap.
      const gridRect = grid.getBoundingClientRect();
      const insideGrid = (
        clientX >= gridRect.left && clientX <= gridRect.right &&
        clientY >= gridRect.top  && clientY <= gridRect.bottom
      );
      if (!insideGrid) drag.overGrid = false;
      return;
    }

    drag.overGrid = true;
    drag.toColId = target.colId;
    drag.toIndex = target.index;

    drag.placeholder.remove();

    const cards = Array.from(target.list.querySelectorAll<HTMLElement>(
      ".vzd-roadmap-card:not(.vzd-roadmap-card--ghost):not(.vzd-roadmap-card--placeholder):not(.vzd-roadmap-card--hidden)"
    ));
    if (target.index >= cards.length) {
      target.list.appendChild(drag.placeholder);
    } else {
      target.list.insertBefore(drag.placeholder, cards[target.index]);
    }
  }

  function startDrag(card: HTMLElement, clientX: number, clientY: number): void {
    if (!isEditMode || !app || !ctx) return;

    const fromColId = card.dataset.colId ?? "";
    const fromIndex = parseInt(card.dataset.itemIndex ?? "0", 10);

    const rect = card.getBoundingClientRect();
    const ghost = doc.body.createEl("div", { cls: "vzd-roadmap-card vzd-roadmap-card--ghost" });
    ghost.style.width = `${rect.width}px`;
    ghost.innerHTML = card.innerHTML;
    ghost.style.left = `${clientX + 8}px`;
    ghost.style.top = `${clientY + 8}px`;

    const placeholder = card.parentElement!.createEl("div", {
      cls: "vzd-roadmap-card vzd-roadmap-card--placeholder",
    });
    placeholder.style.height = `${rect.height}px`;
    card.parentElement!.insertBefore(placeholder, card);
    card.classList.add("vzd-roadmap-card--hidden");

    drag = {
      card, fromColId, fromIndex,
      ghost, placeholder,
      toColId: fromColId, toIndex: fromIndex,
      overGrid: false,
    };

  }

  onDisconnected(grid, () => {
    drag?.ghost.remove();
    drag?.placeholder.remove();
    drag = null;
  });

  // ── Render columns ────────────────────────────────────────────────────────
  for (const col of data.columns) {
    renderColumn(grid, col, isEditMode, app, ctx);
  }

  setupRoadmapCarousel(container, data.columns.length);

  function renderColumn(
    parent: HTMLElement,
    col: RoadmapColumn,
    editMode: boolean,
    app: App | undefined,
    ctx: MarkdownPostProcessorContext | undefined,
  ): void {
    const colEl = parent.createEl("div", { cls: "vzd-roadmap-col" });
    colEl.dataset.colId = col.id;

    const labelKey = COL_LABELS[col.id];
    const header = colEl.createEl("div", { cls: "vzd-roadmap-col-header", text: t(labelKey as Parameters<typeof t>[0]) });
    // Override the CSS text colour with a contrast-checked value. The background
    // is color-mix(accent, secondary) so the right choice depends on the user's
    // accent — we read the computed background after the element is in the DOM.
    header.style.color = bestTextColor(header);

    const list = colEl.createEl("div", { cls: "vzd-roadmap-card-list" });

    col.items.forEach((item, index) => {
      renderCard(list, item, col.id, index, editMode, app, ctx);
    });

    if (editMode && app && ctx) {
      const btn = colEl.createEl("button", { cls: "vzd-roadmap-add-item vzd-btn" });
      setIcon(btn, "plus");
      btn.setAttribute("aria-label", t("roadmap.addItem"));
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        addRoadmapItem(app, ctx, container, col.id, t("roadmap.newItem"));
      });
    }
  }

  function renderCard(
    list: HTMLElement,
    item: RoadmapItem,
    colId: string,
    index: number,
    editMode: boolean,
    app: App | undefined,
    ctx: MarkdownPostProcessorContext | undefined,
  ): void {
    const card = list.createEl("div", { cls: "vzd-roadmap-card" });

    // Title row: title text + optional link icon (same pattern as vizardry-block-label-row)
    const titleRow = card.createEl("div", { cls: "vzd-roadmap-card-title-row" });
    const titleEl = titleRow.createEl("div", { cls: "vzd-roadmap-card-title", text: item.title });

    // Link affordance — chain-link icon appears when this item's title resolves
    // to a heading in the current note via [[#Heading]] annotation or auto-match.
    const heading = resolver.resolve(item.title);
    if (heading && navigateTo) {
      const linkBtn = titleRow.createEl("button", { cls: "vzd-roadmap-card-link-btn vzd-btn" });
      setIcon(linkBtn, "link");
      linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
      markInteractive(linkBtn);
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigateTo(heading);
      });
      if (app && ctx) attachSectionPreview(app, card, heading, ctx.sourcePath);
    }

    if (item.subtitle) {
      card.createEl("div", { cls: "vzd-roadmap-card-subtitle", text: item.subtitle });
    }

    if (editMode && app && ctx) {
      card.dataset.colId = colId;
      card.dataset.itemIndex = String(index);
      card.classList.add("vzd-roadmap-card--draggable");

      titleEl.classList.add("vzd-roadmap-card-title--editable");
      titleEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        activateInlineEdit(titleEl, item.title, (newTitle) => {
          renameRoadmapItem(app, ctx, container, colId, item.title, newTitle);
        });
      });

      // Drag to move — only after deliberate movement, so a click, double-click,
      // or tap never triggers it. preventDefaultDown is false so the browser's
      // native double-click detection (used for rename) keeps working; text
      // selection is suppressed by the gesture helper once a drag begins.
      enableDragGesture(card, {
        preventDefaultDown: false,
        shouldStart: (target) => !card.querySelector(".vzd-inline-input") && !target.closest("button, a"),
        onStart: (x, y) => startDrag(card, x, y),
        onMove: (x, y) => updateDragPosition(x, y),
        onEnd: () => endDrag(),
      });
    }
  }
}
