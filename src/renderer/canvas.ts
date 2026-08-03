import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renderTwoPassCells, buildCardDropTargets, type TwoPassCell } from "./two-pass-cells";
import { attachSectionPreview } from "./section-preview";
import { setupSlideCarousel } from "./grid-carousel";
import { t } from "../i18n";
import type { LinkResolver } from "../shared/links";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { onDisconnected } from "../shared/lifecycle";
import { isEditModeActive } from "../shared/editor";
import { initCanvas, markInteractive } from "./controls";
import { renderLinearKeyBadge } from "../shared/linear-enrichment";
import { renderUpvotyKeyBadge } from "../shared/upvoty-enrichment";
import type { FrameworkDefinition } from "../types";

// ── Relink registry ───────────────────────────────────────────────────────────
// Keeps track of rendered canvas blocks that need their link buttons refreshed
// when the metadata cache updates with new headings.

type RelinkFn = () => void;
const relinkRegistry = new Map<string, Set<RelinkFn>>();

/**
 * Registers a relink callback for a given source file. The callback is
 * removed automatically when `watchEl` is disconnected from the DOM (i.e.
 * the canvas was replaced by a re-render or the note was closed).
 */
export function registerCanvasRelink(
  sourcePath: string,
  fn: RelinkFn,
  watchEl: HTMLElement,
): void {
  if (!relinkRegistry.has(sourcePath)) relinkRegistry.set(sourcePath, new Set());
  const set = relinkRegistry.get(sourcePath)!;
  set.add(fn);
  onDisconnected(watchEl, () => {
    set.delete(fn);
    if (set.size === 0) relinkRegistry.delete(sourcePath);
  });
}

/**
 * Fires all relink callbacks registered for `filePath`. Called by the
 * metadataCache `changed` listener in main.ts.
 */
export function triggerRelink(filePath: string): void {
  relinkRegistry.get(filePath)?.forEach(fn => fn());
}

/**
 * Updates only the link buttons in an already-rendered canvas when the
 * set of available headings has changed. Avoids a full re-render.
 */
export function relinkCanvas(
  container: HTMLElement,
  framework: FrameworkDefinition,
  resolver: LinkResolver,
  navigateTo: (heading: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  for (const blockDef of framework.blocks) {
    const block = container.querySelector<HTMLElement>(`[data-area="${blockDef.area}"]`);
    if (!block) continue;
    const labelRow = block.querySelector<HTMLElement>(".vizardry-block-label-row");
    if (!labelRow) continue;

    // Remove stale link button / ticket badge (if any) before re-evaluating.
    // The ticket badge must go too: if a heading is later added that matches
    // this block's label, the heading link must win, not sit next to a stale
    // ticket badge from before.
    labelRow.querySelector(".vizardry-block-link-btn")?.remove();
    labelRow.querySelector(".vzd-linear-key, .vzd-upvoty-key")?.remove();

    const labelKey = blockDef.label.toLowerCase();
    const heading = resolver.resolve(labelKey);
    if (heading) {
      const linkBtn = labelRow.createEl("button", { cls: "vizardry-block-link-btn vzd-btn" });
      setIcon(linkBtn, "link");
      linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
      linkBtn.dataset.heading = heading;
      markInteractive(linkBtn);
      linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
      // Mirror renderCanvas's clipped-section preview. Attached to the freshly
      // created button (not the persistent block) so a later relink — which
      // removes and recreates this button — can't stack duplicate listeners:
      // the old button's listeners die with it when it leaves the DOM.
      if (app && ctx) attachSectionPreview(app, linkBtn, heading, ctx.sourcePath);
    } else {
      const ticket = resolver.resolveTicket?.(labelKey);
      if (ticket) {
        if (ticket.service === "linear") renderLinearKeyBadge(labelRow, ticket.key);
        else renderUpvotyKeyBadge(labelRow, ticket.key);
      }
    }
  }
}

export function renderError(message: string, container: HTMLElement): void {
  container.addClass("vizardry-error");
  container.createEl("span", { cls: "vizardry-error-icon", text: "⚠" });
  container.createEl("span", { cls: "vizardry-error-message", text: message });
}

export function renderCanvas(
  framework: FrameworkDefinition,
  data: Record<string, string>,
  cardBlocks: Set<string>,
  container: HTMLElement,
  resolver: LinkResolver,
  navigateTo: (heading: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  source?: string,
  allCards: boolean = false,
): void {
  const defaultTitle = framework.label;
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined && isEditModeActive(app))
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, framework.id, title, undefined, source, onTitleEdit, app, ctx);

  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", framework.gridTemplate);
  grid.style.setProperty("--vzd-columns", framework.gridColumns);
  grid.style.setProperty("--vzd-rows", framework.gridRows);

  // Two passes: the first creates every block's DOM (label, link button,
  // body element) and figures out which ones are card-mode; the second
  // (renderTwoPassCells) renders each body. Splitting it this way lets
  // card-mode blocks share a sibling registry (built between the passes) so
  // a card can be dragged from one block into another, not just reordered
  // within its own block — mirroring the cross-cell drag registry in
  // renderMatrix().
  const cells: TwoPassCell[] = [];

  for (const blockDef of framework.blocks) {
    const labelKey = blockDef.label.toLowerCase();
    const block = grid.createEl("div", { cls: "vizardry-block" });
    // Drive grid placement from a custom property (not an inline grid-area) so
    // the mobile carousel and presentation stylesheet rules can override it by
    // specificity rather than fighting an inline style with !important.
    block.style.setProperty("--vzd-area", blockDef.area);
    block.setAttribute("data-area", blockDef.area);

    const labelRow = block.createEl("div", { cls: "vizardry-block-label-row" });
    labelRow.createEl("span", { text: blockDef.label, cls: "vizardry-block-label" });

    const heading = resolver.resolve(labelKey);
    if (heading) {
      const linkBtn = labelRow.createEl("button", { cls: "vizardry-block-link-btn vzd-btn" });
      setIcon(linkBtn, "link");
      linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
      linkBtn.dataset.heading = heading;
      markInteractive(linkBtn);
      linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
      if (app && ctx) attachSectionPreview(app, block, heading, ctx.sourcePath);
    } else {
      const ticket = resolver.resolveTicket?.(labelKey);
      if (ticket) {
        if (ticket.service === "linear") renderLinearKeyBadge(labelRow, ticket.key);
        else renderUpvotyKeyBadge(labelRow, ticket.key);
      }
    }

    const content = data[labelKey] ?? "";
    const body = block.createEl("div", { cls: "vizardry-block-body" });
    if (blockDef.placeholder) {
      body.setAttribute("data-placeholder", blockDef.placeholder);
    }

    const isCard = allCards || cardBlocks.has(labelKey) || (blockDef.cardBlock ?? false);
    cells.push({ body, label: blockDef.label, content, isCard });
  }

  const cardTargets = buildCardDropTargets(cells);
  renderTwoPassCells(cells, cardTargets, container, app, ctx, resolver, navigateTo, t("edit.clickToEdit"));

  setupSlideCarousel(container, ".vizardry-block", "vizardry-block-active", framework.blocks.length);
}
