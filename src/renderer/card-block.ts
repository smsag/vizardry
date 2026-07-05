import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import { writeBlockContent } from "../shared/block-edit";
import { activateBlockEdit } from "./block-editor";
import { renderInline } from "../shared/inline-markdown";
import { ownerWindow } from "../shared/lifecycle";

/** A sibling drop-zone registered by the parent canvas (e.g. matrix cells). */
export type CardDropTarget = { body: HTMLElement; blockLabel: string };

type DragState = {
  card: HTMLElement;
  fromIndex: number;
  ghost: HTMLElement;
  placeholder: HTMLElement;
  toIndex: number;
  /** null = own body; otherwise a sibling body we're hovering over */
  activeDrop: CardDropTarget | null;
};

export function renderCardBlock(
  body: HTMLElement,
  blockLabel: string,
  content: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  container?: HTMLElement,
  /** Other card-mode cells that cards can be dragged into (cross-cell moves). */
  siblings?: CardDropTarget[],
): void {
  body.empty();
  body.dataset.blockContent = content;
  const doc = body.ownerDocument;
  const win = ownerWindow(body);

  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const isEditMode = !!(app && ctx && container)
    && app.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";

  if (lines.length === 0) {
    body.addClass("vizardry-block-empty");
    if (!isEditMode) return;
  } else {
    body.removeClass("vizardry-block-empty");
    body.addClass("vzd-card-block-body");
  }

  // ── Drag state ────────────────────────────────────────────────────────────

  let drag: DragState | null = null;

  function getCardsIn(b: HTMLElement): HTMLElement[] {
    return Array.from(b.querySelectorAll<HTMLElement>(
      ".vzd-card-block-card:not(.vzd-story-task-card--ghost)" +
      ":not(.vzd-story-task-card--placeholder)" +
      ":not(.vzd-story-task-card--hidden)"
    ));
  }

  function findDropIndex(b: HTMLElement, clientY: number): number {
    const cards = getCardsIn(b);
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  }

  function endDrag(): void {
    if (!drag) return;
    const { card, fromIndex, toIndex, ghost, placeholder, activeDrop } = drag;
    drag = null;

    ghost.remove();
    placeholder.remove();
    card.classList.remove("vzd-story-task-card--hidden");

    // Clear drop-active highlight on all siblings
    (siblings ?? []).forEach(s => s.body.classList.remove("vzd-card-block-body--drop-active"));

    doc.removeEventListener("mousemove", onDocMouseMove);
    doc.removeEventListener("mouseup", onDocMouseUp);

    if (!app || !ctx || !container) return;

    const savedScrollY = win.scrollY;
    const savedScrollX = win.scrollX;

    if (!activeDrop) {
      // Within-block reorder — existing behaviour
      if (toIndex === fromIndex) return;
      const currentLines = (body.dataset.blockContent ?? "").split("\n").map(l => l.trim()).filter(Boolean);
      const reordered = [...currentLines];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      body.dataset.blockContent = reordered.join("\n");
      writeBlockContent(app, ctx, container, blockLabel, reordered.join("\n"));
    } else {
      // Cross-cell move
      const sourceLines = (body.dataset.blockContent ?? "").split("\n").map(l => l.trim()).filter(Boolean);
      const [movedCard] = sourceLines.splice(fromIndex, 1);
      const destLines = (activeDrop.body.dataset.blockContent ?? "").split("\n").map(l => l.trim()).filter(Boolean);
      destLines.splice(toIndex, 0, movedCard);

      body.dataset.blockContent = sourceLines.join("\n");
      activeDrop.body.dataset.blockContent = destLines.join("\n");

      // Update empty state immediately so the source cell doesn't look broken
      if (sourceLines.length === 0) {
        body.addClass("vizardry-block-empty");
        body.removeClass("vzd-card-block-body");
      }
      activeDrop.body.removeClass("vizardry-block-empty");
      activeDrop.body.addClass("vzd-card-block-body");

      // Write source first if it's lower in the file to keep line numbers stable
      writeBlockContent(app, ctx, container, blockLabel, sourceLines.join("\n"));
      writeBlockContent(app, ctx, container, activeDrop.blockLabel, destLines.join("\n"));
    }

    win.requestAnimationFrame(() => win.scrollTo(savedScrollX, savedScrollY));
  }

  function updateDragPosition(clientX: number, clientY: number): void {
    if (!drag) return;
    drag.ghost.style.left = `${clientX + 8}px`;
    drag.ghost.style.top = `${clientY + 8}px`;

    // Determine which body the cursor is over (own or sibling)
    let target: CardDropTarget | null = null;

    for (const sib of (siblings ?? [])) {
      const r = sib.body.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        target = sib;
        break;
      }
    }
    if (!target) {
      const r = body.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        target = { body, blockLabel };
      }
    }

    // Update drop-active highlight on sibling bodies
    (siblings ?? []).forEach(s =>
      s.body.classList.toggle("vzd-card-block-body--drop-active", !!target && s.body === target.body)
    );

    if (!target) {
      drag.activeDrop = null;
      drag.placeholder.remove();
      return;
    }

    drag.activeDrop = target.body === body ? null : target;
    drag.toIndex = findDropIndex(target.body, clientY);

    drag.placeholder.remove();
    const cards = getCardsIn(target.body);
    if (drag.toIndex >= cards.length) {
      target.body.appendChild(drag.placeholder);
    } else {
      target.body.insertBefore(drag.placeholder, cards[drag.toIndex]);
    }
  }

  function onDocMouseMove(e: MouseEvent): void { updateDragPosition(e.clientX, e.clientY); }
  const onDocMouseUp = (): void => endDrag();

  function startDrag(card: HTMLElement, e: MouseEvent | Touch): void {
    const fromIndex = parseInt(card.dataset.cardIndex ?? "0", 10);
    const rect = card.getBoundingClientRect();

    const ghost = doc.body.createEl("div", {
      cls: "vzd-card-block-card vzd-story-task-card vzd-story-task-card--ghost",
    });
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${e.clientX + 8}px`;
    ghost.style.top = `${e.clientY + 8}px`;
    ghost.createEl("div", { cls: "vzd-story-task-name", text: card.dataset.cardText ?? "" });

    const placeholder = body.createEl("div", {
      cls: "vzd-card-block-card vzd-story-task-card vzd-story-task-card--placeholder",
    });
    placeholder.style.height = `${rect.height}px`;
    body.insertBefore(placeholder, card);
    card.classList.add("vzd-story-task-card--hidden");

    drag = { card, fromIndex, ghost, placeholder, toIndex: fromIndex, activeDrop: null };

    doc.addEventListener("mousemove", onDocMouseMove);
    doc.addEventListener("mouseup", onDocMouseUp);
  }

  // ── Card rendering ────────────────────────────────────────────────────────

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const card = body.createEl("div", { cls: "vzd-card-block-card vzd-story-task-card" });
    renderInline(card.createEl("div", { cls: "vzd-story-task-name" }), line);

    if (isEditMode) {
      card.dataset.cardIndex = String(i);
      card.dataset.cardText = line;
      card.classList.add("vzd-story-task-card--draggable");

      const THRESHOLD = 5;
      card.addEventListener("mousedown", (e) => {
        // Let buttons and links handle their own click (e.g. Linear/Upvoty badges).
        if ((e.target as HTMLElement).closest("button, a")) return;
        e.preventDefault();
        e.stopPropagation();
        const originX = e.clientX;
        const originY = e.clientY;
        let started = false;

        const onPreMove = (mv: MouseEvent): void => {
          if (started) return;
          if (Math.abs(mv.clientX - originX) > THRESHOLD || Math.abs(mv.clientY - originY) > THRESHOLD) {
            started = true;
            doc.removeEventListener("mousemove", onPreMove);
            doc.removeEventListener("mouseup", onPreCancel);
            startDrag(card, mv);
          }
        };
        const onPreCancel = (): void => {
          doc.removeEventListener("mousemove", onPreMove);
          doc.removeEventListener("mouseup", onPreCancel);
          if (app && ctx && container) {
            activateBlockEdit(body, blockLabel, body.dataset.blockContent ?? "", app, ctx, container);
          }
        };

        doc.addEventListener("mousemove", onPreMove);
        doc.addEventListener("mouseup", onPreCancel);
      });

      card.addEventListener("touchstart", (e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        e.preventDefault();
        startDrag(card, e.touches[0]);
        const onTouchMove = (ev: TouchEvent): void => {
          if (!drag) return;
          ev.preventDefault();
          updateDragPosition(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const onTouchEnd = (): void => {
          endDrag();
          doc.removeEventListener("touchmove", onTouchMove);
          doc.removeEventListener("touchend", onTouchEnd);
        };
        doc.addEventListener("touchmove", onTouchMove, { passive: false });
        doc.addEventListener("touchend", onTouchEnd);
      }, { passive: false });
    }
  }

  // Click on the block body background (not on a card) opens the textarea editor
  if (isEditMode && app && ctx && container) {
    body.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".vzd-card-block-card")) return;
      activateBlockEdit(body, blockLabel, body.dataset.blockContent ?? "", app, ctx, container);
    });
  }
}
