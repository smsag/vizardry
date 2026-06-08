import { MarkdownRenderChild, MarkdownRenderer, setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { RoadmapColumn, RoadmapData, RoadmapItem } from "../types";
import { initCanvas } from "./controls";
import { onDisconnected } from "../shared/lifecycle";
import { t } from "../i18n";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { addRoadmapItem, renameRoadmapItem, moveRoadmapItem } from "../shared/roadmap-edit";

const COL_LABELS: Record<string, string> = {
  now:   "roadmap.col.now",
  next:  "roadmap.col.next",
  later: "roadmap.col.later",
};

export function renderRoadmap(
  data: RoadmapData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const isEditMode = !!(app && ctx && source !== undefined);
  const defaultTitle = "Now/Next/Later Roadmap";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;

  initCanvas(container, "roadmap", title, undefined, source, onTitleEdit);

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

    document.removeEventListener("mousemove", onDocMouseMove);
    document.removeEventListener("mouseup", onDocMouseUp);

    if (!app || !ctx || !overGrid) return;

    const savedScrollY = window.scrollY;
    const savedScrollX = window.scrollX;

    if (fromColId !== toColId || fromIndex !== toIndex) {
      moveRoadmapItem(app, ctx, container, fromColId, fromIndex, toColId, toIndex);
    }

    requestAnimationFrame(() => window.scrollTo(savedScrollX, savedScrollY));
  }

  function findDropTarget(clientX: number, clientY: number): { list: HTMLElement; colId: string; index: number } | null {
    const els = document.elementsFromPoint(clientX, clientY);
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

  function onDocMouseMove(e: MouseEvent): void { updateDragPosition(e.clientX, e.clientY); }
  const onDocMouseUp = (): void => endDrag();

  function startDrag(card: HTMLElement, e: MouseEvent | Touch): void {
    if (!isEditMode || !app || !ctx) return;
    if (card.querySelector(".vzd-inline-input")) return;

    const fromColId = card.dataset.colId ?? "";
    const fromIndex = parseInt(card.dataset.itemIndex ?? "0", 10);

    const rect = card.getBoundingClientRect();
    const ghost = document.body.createEl("div", { cls: "vzd-roadmap-card vzd-roadmap-card--ghost" });
    ghost.style.width = `${rect.width}px`;
    ghost.innerHTML = card.innerHTML;
    ghost.style.left = `${e.clientX + 8}px`;
    ghost.style.top = `${e.clientY + 8}px`;

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

    document.addEventListener("mousemove", onDocMouseMove);
    document.addEventListener("mouseup", onDocMouseUp);
  }

  onDisconnected(grid, () => {
    document.removeEventListener("mousemove", onDocMouseMove);
    document.removeEventListener("mouseup", onDocMouseUp);
    drag?.ghost.remove();
    drag?.placeholder.remove();
    drag = null;
  });

  // ── Render columns ────────────────────────────────────────────────────────
  for (const col of data.columns) {
    renderColumn(grid, col, isEditMode, app, ctx);
  }

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
    colEl.createEl("div", { cls: "vzd-roadmap-col-header", text: t(labelKey as Parameters<typeof t>[0]) });

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
    const titleEl = card.createEl("div", { cls: "vzd-roadmap-card-title" });
    // Render the title as markdown so [[wiki-links]] and [text](url) become
    // clickable. MarkdownRenderer wraps content in a <p>; we unwrap it so the
    // title stays inline. When app/ctx are unavailable (e.g. tests), fall back
    // to plain text.
    if (app && ctx) {
      const child = new MarkdownRenderChild(titleEl);
      ctx.addChild(child);
      void MarkdownRenderer.render(app, item.title, titleEl, ctx.sourcePath, child).then(() => {
        const p = titleEl.querySelector(":scope > p");
        if (p) {
          while (p.firstChild) titleEl.insertBefore(p.firstChild, p);
          p.remove();
        }
      });
    } else {
      titleEl.textContent = item.title;
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

      card.addEventListener("mousedown", (e) => {
        if (card.querySelector(".vzd-inline-input")) return;
        // NOTE: do NOT call e.preventDefault() here. Preventing default on
        // mousedown can break dblclick detection in CM6 / Obsidian Live Preview
        // because the browser relies on the default mousedown handling to count
        // double-click sequences. We stop propagation to keep Obsidian from
        // acting on the click, but text-selection prevention is handled via
        // CSS (user-select: none) once a real drag begins.
        e.stopPropagation();

        const originX = e.clientX;
        const originY = e.clientY;
        let started = false;

        const onPreMove = (mv: MouseEvent): void => {
          if (started) return;
          if (Math.abs(mv.clientX - originX) > 5 || Math.abs(mv.clientY - originY) > 5) {
            started = true;
            mv.preventDefault(); // Prevent text selection once drag is confirmed.
            document.removeEventListener("mousemove", onPreMove);
            document.removeEventListener("mouseup", onPreCancel);
            startDrag(card, mv);
          }
        };
        const onPreCancel = (): void => {
          document.removeEventListener("mousemove", onPreMove);
          document.removeEventListener("mouseup", onPreCancel);
        };

        document.addEventListener("mousemove", onPreMove);
        document.addEventListener("mouseup", onPreCancel);
      });

      card.addEventListener("touchstart", (e) => {
        if (card.querySelector(".vzd-inline-input")) return;
        e.preventDefault();
        startDrag(card, e.touches[0]);
        const onTouchMove = (ev: TouchEvent): void => {
          if (!drag) return;
          ev.preventDefault();
          updateDragPosition(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const onTouchEnd = (): void => {
          endDrag();
          document.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("touchend", onTouchEnd);
        };
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
      }, { passive: false });
    }
  }
}
