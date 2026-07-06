import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView, Notice } from "obsidian";
import { writeBlockContent, moveCardBetweenBlocks } from "../shared/block-edit";
import { activateBlockEdit } from "./block-editor";
import { renderInline } from "../shared/inline-markdown";
import { ownerWindow } from "../shared/lifecycle";
import { enableDragGesture, preserveScroll } from "../shared/drag-gesture";
import { renderHeadingLink } from "./controls";
import type { LinkResolver } from "../shared/links";
import { t } from "../i18n";

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
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
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

    if (!app || !ctx || !container) return;

    preserveScroll(win, () => {
      if (!activeDrop) {
        // Within-block reorder
        if (toIndex === fromIndex) return;
        const currentLines = (body.dataset.blockContent ?? "").split("\n").map(l => l.trim()).filter(Boolean);
        const reordered = [...currentLines];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        const newContent = reordered.join("\n");

        if (writeBlockContent(app, ctx, container, blockLabel, newContent)) {
          body.dataset.blockContent = newContent;
        } else {
          new Notice(t("edit.writeFailed"));
        }
      } else {
        // Cross-block move — located and edited as a single atomic operation
        // (see moveCardBetweenBlocks' doc comment for why two separate
        // writeBlockContent calls are unreliable here).
        const sourceLines = (body.dataset.blockContent ?? "").split("\n").map(l => l.trim()).filter(Boolean);
        const [movedCard] = sourceLines.splice(fromIndex, 1);
        const destLines = (activeDrop.body.dataset.blockContent ?? "").split("\n").map(l => l.trim()).filter(Boolean);
        destLines.splice(toIndex, 0, movedCard);
        const newSourceContent = sourceLines.join("\n");
        const newDestContent = destLines.join("\n");

        const written = moveCardBetweenBlocks(
          app, ctx, container,
          { label: blockLabel, newContent: newSourceContent },
          { label: activeDrop.blockLabel, newContent: newDestContent },
        );
        if (!written) {
          new Notice(t("edit.writeFailed"));
          return;
        }

        body.dataset.blockContent = newSourceContent;
        activeDrop.body.dataset.blockContent = newDestContent;

        // Update empty state immediately so the source cell doesn't look broken
        if (sourceLines.length === 0) {
          body.addClass("vizardry-block-empty");
          body.removeClass("vzd-card-block-body");
        }
        activeDrop.body.removeClass("vizardry-block-empty");
        activeDrop.body.addClass("vzd-card-block-body");
      }
    });
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

  function startDrag(card: HTMLElement, clientX: number, clientY: number): void {
    const fromIndex = parseInt(card.dataset.cardIndex ?? "0", 10);
    const rect = card.getBoundingClientRect();

    const ghost = doc.body.createEl("div", {
      cls: "vzd-card-block-card vzd-story-task-card vzd-story-task-card--ghost",
    });
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${clientX + 8}px`;
    ghost.style.top = `${clientY + 8}px`;
    ghost.createEl("div", { cls: "vzd-story-task-name", text: card.dataset.cardText ?? "" });

    const placeholder = body.createEl("div", {
      cls: "vzd-card-block-card vzd-story-task-card vzd-story-task-card--placeholder",
    });
    placeholder.style.height = `${rect.height}px`;
    body.insertBefore(placeholder, card);
    card.classList.add("vzd-story-task-card--hidden");

    drag = { card, fromIndex, ghost, placeholder, toIndex: fromIndex, activeDrop: null };
  }

  // ── Card rendering ────────────────────────────────────────────────────────

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const card = body.createEl("div", { cls: "vzd-card-block-card vzd-story-task-card" });
    renderInline(card.createEl("div", { cls: "vzd-story-task-name" }), line);
    renderHeadingLink(card, line, resolver, navigateTo, app, ctx?.sourcePath);

    if (isEditMode) {
      card.dataset.cardIndex = String(i);
      card.dataset.cardText = line;
      card.classList.add("vzd-story-task-card--draggable");

      enableDragGesture(card, {
        // Let buttons and links handle their own click (e.g. Linear/Upvoty badges).
        shouldStart: (target) => !target.closest("button, a"),
        onStart: (x, y) => startDrag(card, x, y),
        onMove: (x, y) => updateDragPosition(x, y),
        onEnd: () => endDrag(),
        onClick: () => {
          if (app && ctx && container) {
            activateBlockEdit(body, blockLabel, body.dataset.blockContent ?? "", app, ctx, container);
          }
        },
      });
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
