import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { RoadmapColumn, RoadmapData, RoadmapItem } from "../types";
import { initCanvas } from "./controls";
import { onDisconnected } from "../shared/lifecycle";
import { t } from "../i18n";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { addRoadmapItem, renameRoadmapItem, moveRoadmapItem } from "../shared/roadmap-edit";
import { getLinearService } from "../linear";

const LINEAR_KEY_RE = /^[A-Z]+-\d+$/;

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
    el.textContent = "";
    const input = el.createEl("input", { cls: "vzd-inline-input", type: "text" });
    input.value = currentValue;
    input.focus({ preventScroll: true });
    input.select();
    let committed = false;
    const commit = (): void => {
      if (committed) return;
      committed = true;
      el.classList.remove("vzd-editing");
      const v = input.value.trim();
      if (v && v !== currentValue) {
        onCommit(v);
        el.textContent = v;
      } else {
        el.textContent = currentValue;
      }
    };
    const cancel = (): void => {
      if (committed) return;
      committed = true;
      el.classList.remove("vzd-editing");
      el.textContent = currentValue;
    };
    input.addEventListener("blur", commit);
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
      drag.overGrid = false;
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

  // ── Hover popover builder ─────────────────────────────────────────────────
  function buildPreview(
    issueKey: string,
    card: HTMLElement,
    cachedStatusName: string | null,
    cachedStatusColor: string,
  ): HTMLElement {
    const el = document.body.createEl("div", { cls: "vzd-roadmap-preview" });

    // Position: above-right of card, flip below if insufficient space
    const rect = card.getBoundingClientRect();
    const previewWidth = 320;
    const previewHeight = 180; // estimated
    let left = rect.right + 8;
    if (left + previewWidth > window.innerWidth - 8) left = rect.left - previewWidth - 8;
    let top = rect.top;
    if (top + previewHeight > window.innerHeight - 8) top = window.innerHeight - previewHeight - 8;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;

    const header = el.createEl("div", { cls: "vzd-roadmap-preview-header" });
    header.createEl("span", { cls: "vzd-roadmap-linear-key", text: issueKey });
    if (cachedStatusName) {
      const pill = header.createEl("span", { cls: "vzd-roadmap-linear-status", text: cachedStatusName });
      pill.style.backgroundColor = cachedStatusColor;
    }
    const titleSpan = header.createEl("span", { cls: "vzd-roadmap-preview-title" });

    const body = el.createEl("div", { cls: "vzd-roadmap-preview-body" });
    const summaryEl = body.createEl("p", { cls: "vzd-roadmap-preview-summary" });
    summaryEl.createEl("span", { cls: "vzd-roadmap-preview-loading", text: t("roadmap.linear.loading") });

    const footer = el.createEl("div", { cls: "vzd-roadmap-preview-footer" });
    const updatedEl = footer.createEl("span", { cls: "vzd-roadmap-preview-updated" });

    // Async: fetch summary
    const svc = getLinearService();
    if (svc) {
      svc.getSummary(issueKey).then(result => {
        if (!result) {
          summaryEl.empty();
          summaryEl.createEl("span", { cls: "vzd-roadmap-preview-error", text: t("roadmap.linear.error") });
          return;
        }
        titleSpan.textContent = result.title;
        summaryEl.empty();
        if (result.summary) {
          summaryEl.textContent = result.summary;
        } else {
          summaryEl.createEl("span", { cls: "vzd-roadmap-preview-error", text: t("roadmap.linear.noSummary") });
        }
        // Update status pill in header
        const existingPill = header.querySelector<HTMLElement>(".vzd-roadmap-linear-status");
        if (existingPill) {
          existingPill.textContent = result.state.name;
          existingPill.style.backgroundColor = result.state.color;
        } else {
          const pill = header.createEl("span", { cls: "vzd-roadmap-linear-status", text: result.state.name });
          pill.style.backgroundColor = result.state.color;
          header.insertBefore(pill, titleSpan);
        }
        // Format "Updated Xh ago"
        const updatedAt = new Date(result.updatedAt).getTime();
        const diffMs = Date.now() - updatedAt;
        const diffH = Math.round(diffMs / 3_600_000);
        updatedEl.textContent = diffH < 1 ? "Updated just now" : `Updated ${diffH}h ago`;
      }).catch(() => {
        summaryEl.empty();
        summaryEl.createEl("span", { cls: "vzd-roadmap-preview-error", text: t("roadmap.linear.error") });
      });
    }

    return el;
  }

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
    const titleEl = card.createEl("div", { cls: "vzd-roadmap-card-title", text: item.title });

    const isLinearKey = item.subtitle ? LINEAR_KEY_RE.test(item.subtitle) : false;

    if (item.subtitle && !isLinearKey) {
      // Plain text subtitle
      card.createEl("div", { cls: "vzd-roadmap-card-subtitle", text: item.subtitle });
    }

    if (item.subtitle && isLinearKey) {
      const key = item.subtitle;
      const meta = card.createEl("div", { cls: "vzd-roadmap-card-meta" });
      const keyBadge = meta.createEl("span", { cls: "vzd-roadmap-linear-key", text: key });
      const statusPill = meta.createEl("span", { cls: "vzd-roadmap-linear-status" });
      statusPill.style.display = "none";

      // Async: fetch status and update pill
      const svc = getLinearService();
      if (svc) {
        svc.getStatus(key).then(state => {
          if (!state) return;
          statusPill.textContent = state.name;
          statusPill.style.backgroundColor = state.color;
          statusPill.style.display = "";
        }).catch(() => { /* ignore */ });
      }

      // Hover popover (400ms delay)
      let hoverTimer: ReturnType<typeof setTimeout> | null = null;
      let preview: HTMLElement | null = null;

      const removePreview = (): void => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        if (preview) { preview.remove(); preview = null; }
      };

      keyBadge.addEventListener("mouseenter", () => {
        if (!getLinearService()?.isEnabled()) return;
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          preview = buildPreview(key, card, statusPill.textContent, statusPill.style.backgroundColor);
          document.body.appendChild(preview);
        }, 400);
      });
      keyBadge.addEventListener("mouseleave", removePreview);
      card.addEventListener("mouseleave", removePreview);

      onDisconnected(card, removePreview);
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
        e.preventDefault();
        e.stopPropagation();

        const originX = e.clientX;
        const originY = e.clientY;
        let started = false;

        const onPreMove = (mv: MouseEvent): void => {
          if (started) return;
          if (Math.abs(mv.clientX - originX) > 5 || Math.abs(mv.clientY - originY) > 5) {
            started = true;
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
