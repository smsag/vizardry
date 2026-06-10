import type { App, MarkdownPostProcessorContext } from "obsidian";
import { writeBlockContent } from "../shared/block-edit";
import { activateBlockEdit } from "./block-editor";
import { renderInline } from "../shared/inline-markdown";

type DragState = {
  card: HTMLElement;
  fromIndex: number;
  ghost: HTMLElement;
  placeholder: HTMLElement;
  toIndex: number;
  overList: boolean;
};

export function renderCardBlock(
  body: HTMLElement,
  blockLabel: string,
  content: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  container?: HTMLElement,
): void {
  body.empty();
  body.dataset.blockContent = content;

  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const isEditMode = !!(app && ctx && container);

  if (lines.length === 0) {
    body.addClass("vizardry-block-empty");
    return;
  }

  body.removeClass("vizardry-block-empty");
  body.addClass("vzd-card-block-body");

  // ── Drag state ────────────────────────────────────────────────────────────

  let drag: DragState | null = null;

  function getCards(): HTMLElement[] {
    return Array.from(body.querySelectorAll<HTMLElement>(
      ".vzd-card-block-card:not(.vzd-story-task-card--ghost):not(.vzd-story-task-card--placeholder):not(.vzd-story-task-card--hidden)"
    ));
  }

  function endDrag(): void {
    if (!drag) return;
    const { card, fromIndex, toIndex, ghost, placeholder, overList } = drag;
    drag = null;

    ghost.remove();
    placeholder.remove();
    card.classList.remove("vzd-story-task-card--hidden");

    document.removeEventListener("mousemove", onDocMouseMove);
    document.removeEventListener("mouseup", onDocMouseUp);

    if (!overList || !app || !ctx || !container || toIndex === fromIndex) return;

    const savedScrollY = window.scrollY;
    const savedScrollX = window.scrollX;

    // toIndex is in terms of visible (non-dragged) cards, which matches the
    // post-splice array after removing fromIndex — no offset adjustment needed.
    const currentLines = (body.dataset.blockContent ?? "")
      .split("\n").map(l => l.trim()).filter(Boolean);
    const reordered = [...currentLines];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    body.dataset.blockContent = reordered.join("\n");
    writeBlockContent(app, ctx, container, blockLabel, reordered.join("\n"));

    requestAnimationFrame(() => window.scrollTo(savedScrollX, savedScrollY));
  }

  function findDropIndex(clientY: number): number {
    const cards = getCards();
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }

  function updateDragPosition(clientX: number, clientY: number): void {
    if (!drag) return;
    drag.ghost.style.left = `${clientX + 8}px`;
    drag.ghost.style.top = `${clientY + 8}px`;

    const bodyRect = body.getBoundingClientRect();
    if (
      clientX < bodyRect.left - 40 || clientX > bodyRect.right + 40 ||
      clientY < bodyRect.top - 60 || clientY > bodyRect.bottom + 60
    ) {
      drag.overList = false;
      drag.placeholder.remove();
      return;
    }

    drag.overList = true;
    drag.toIndex = findDropIndex(clientY);

    drag.placeholder.remove();
    const cards = getCards();
    if (drag.toIndex >= cards.length) {
      body.appendChild(drag.placeholder);
    } else {
      body.insertBefore(drag.placeholder, cards[drag.toIndex]);
    }
  }

  function onDocMouseMove(e: MouseEvent): void { updateDragPosition(e.clientX, e.clientY); }
  const onDocMouseUp = (): void => endDrag();

  function startDrag(card: HTMLElement, e: MouseEvent | Touch): void {
    const fromIndex = parseInt(card.dataset.cardIndex ?? "0", 10);
    const rect = card.getBoundingClientRect();

    const ghost = document.body.createEl("div", {
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

    drag = { card, fromIndex, ghost, placeholder, toIndex: fromIndex, overList: true };

    document.addEventListener("mousemove", onDocMouseMove);
    document.addEventListener("mouseup", onDocMouseUp);
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
        e.preventDefault();
        e.stopPropagation();
        const originX = e.clientX;
        const originY = e.clientY;
        let started = false;

        const onPreMove = (mv: MouseEvent): void => {
          if (started) return;
          if (Math.abs(mv.clientX - originX) > THRESHOLD || Math.abs(mv.clientY - originY) > THRESHOLD) {
            started = true;
            document.removeEventListener("mousemove", onPreMove);
            document.removeEventListener("mouseup", onPreCancel);
            startDrag(card, mv);
          }
        };
        const onPreCancel = (): void => {
          document.removeEventListener("mousemove", onPreMove);
          document.removeEventListener("mouseup", onPreCancel);
          // Drag threshold never crossed — treat as a plain click → open editor
          if (app && ctx && container) {
            activateBlockEdit(body, blockLabel, body.dataset.blockContent ?? "", app, ctx, container);
          }
        };

        document.addEventListener("mousemove", onPreMove);
        document.addEventListener("mouseup", onPreCancel);
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
          document.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("touchend", onTouchEnd);
        };
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
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
