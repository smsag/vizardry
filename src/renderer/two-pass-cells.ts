/**
 * Shared "two-pass" block/cell rendering used by both the grid frameworks
 * (canvas.ts) and the 2×2/4×4 matrices (matrix.ts): the first pass creates
 * every block/cell's DOM and decides which are card-mode; the second pass
 * (this module) renders each one, after a cross-block sibling registry has
 * been built from the first pass — so a card can be dragged from one
 * block/cell into another, not just reordered within its own.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renderBlockBody, activateBlockEdit } from "./block-editor";
import { renderCardBlock, type CardDropTarget } from "./card-block";
import type { LinkResolver } from "../shared/links";
import { isEditModeActive } from "../shared/editor";

export interface TwoPassCell {
  body: HTMLElement;
  /** Card label (canvas.ts: blockDef.label; matrix.ts: the row-col cell key). */
  label: string;
  content: string;
  isCard: boolean;
}

/** Cross-block/cross-cell drop targets: every card-mode cell, as a sibling
 *  candidate for every OTHER card-mode cell. */
export function buildCardDropTargets(cells: TwoPassCell[]): CardDropTarget[] {
  return cells.filter(c => c.isCard).map(c => ({ body: c.body, blockLabel: c.label }));
}

export function renderTwoPassCells(
  cells: TwoPassCell[],
  cardTargets: CardDropTarget[],
  container: HTMLElement,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
  /** Tooltip shown on hover for non-card, click-to-edit cells. Omit for none. */
  editTooltip?: string,
): void {
  // Read Mode still provides app/ctx (the post-processor runs there too), so
  // gate the edit affordance on the actual view mode — otherwise a box/cell
  // shows a hover border and click-to-edit cursor even though it's a no-op.
  const isEditMode = !!(app && ctx && isEditModeActive(app));

  for (const { body, label, content, isCard } of cells) {
    if (isCard) {
      const siblings = cardTargets.filter(t => t.body !== body);
      renderCardBlock(body, label, content, app, ctx, container, siblings, resolver, navigateTo);
      continue;
    }

    renderBlockBody(body, content);
    if (!isEditMode || !app || !ctx) continue;

    body.addClass("vzd-block-editable");
    if (editTooltip) body.setAttribute("title", editTooltip);
    body.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      activateBlockEdit(body, label, body.dataset.blockContent ?? "", app, ctx, container);
    });
  }
}
