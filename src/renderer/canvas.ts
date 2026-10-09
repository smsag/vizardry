import { setIcon, Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renderTwoPassCells, buildCardDropTargets, type TwoPassCell } from "./two-pass-cells";
import { attachSectionPreview } from "./section-preview";
import { setupSlideCarousel } from "./grid-carousel";
import { t } from "../i18n";
import type { LinkResolver } from "../shared/links";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { parsePeriod, writeCanvasPeriod } from "../shared/period-edit";
import { onDisconnected } from "../shared/lifecycle";
import { isEditModeActive } from "../shared/editor";
import { initCanvas, markInteractive } from "./controls";
import { renderHeaderChip } from "./header-chip";
import { renderLinearKeyBadge } from "../shared/linear-enrichment";
import { renderUpvotyKeyBadge } from "../shared/upvoty-enrichment";
import type { FrameworkDefinition } from "../types";
import { collapseGridLayout } from "../shared/grid-layout";

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

/**
 * Renders the optional `period:` timeframe as a labelled chip in the canvas
 * header, just before the action buttons. In edit mode the value is
 * click-to-edit (writing back the `period:` line); read-only when there's a
 * value but no editor. Renders nothing when empty and not editable.
 */
function renderPeriodField(
  header: HTMLElement,
  container: HTMLElement,
  source: string,
  editable: boolean,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  renderHeaderChip(header, {
    label: t("period.label"),
    value: parsePeriod(source),
    placeholder: t("period.placeholder"),
    onCommit: (editable && app && ctx)
      ? (next) => { if (!writeCanvasPeriod(app, ctx, container, next)) new Notice(t("edit.writeFailed")); }
      : undefined,
  });
}

/**
 * One warning per `block:` label the framework doesn't have. A block left
 * out of the source isn't drawn, so a misspelled label would otherwise make
 * the block, and the content written under it, vanish without a trace.
 */
export function unknownBlockWarnings(framework: FrameworkDefinition, data: Record<string, string>): string[] {
  const known = new Set(framework.blocks.map(b => b.label.toLowerCase()));
  const names = framework.blocks.map(b => b.label).join(", ");
  return Object.keys(data)
    .filter(key => !known.has(key))
    .map(key => `Unknown block "${key}": not drawn. ${framework.label} has: ${names}`);
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
  const editable = !!(app && ctx && source !== undefined && isEditModeActive(app));
  const onTitleEdit = editable
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  const extraHeader = framework.periodField && source !== undefined
    ? (header: HTMLElement) => renderPeriodField(header, container, source, editable, app, ctx)
    : undefined;
  initCanvas(container, framework.id, title, extraHeader, source, onTitleEdit, app, ctx);

  // A block left out of the source isn't drawn, and the grid closes the gap
  // (`type: swot` with only Strengths and Weaknesses → two blocks, one row).
  // A canvas that declares no known block at all still shows the full
  // skeleton with its prompts, so a bare `type:` line isn't an empty box.
  const declared = framework.blocks.filter(b => Object.prototype.hasOwnProperty.call(data, b.label.toLowerCase()));
  const visibleBlocks = declared.length > 0 ? declared : framework.blocks;
  const fullLayout = { template: framework.gridTemplate, columns: framework.gridColumns, rows: framework.gridRows };
  const layout = visibleBlocks.length === framework.blocks.length
    ? fullLayout
    : collapseGridLayout(fullLayout, new Set(visibleBlocks.map(b => b.area)));

  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", layout.template);
  grid.style.setProperty("--vzd-columns", layout.columns);
  grid.style.setProperty("--vzd-rows", layout.rows);

  // Two passes: the first creates every block's DOM (label, link button,
  // body element) and figures out which ones are card-mode; the second
  // (renderTwoPassCells) renders each body. Splitting it this way lets
  // card-mode blocks share a sibling registry (built between the passes) so
  // a card can be dragged from one block into another, not just reordered
  // within its own block — mirroring the cross-cell drag registry in
  // renderMatrix().
  const cells: TwoPassCell[] = [];

  for (const blockDef of visibleBlocks) {
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
      // On the button, not the block: a relink replaces the button, and a
      // preview attached to the block would keep the old heading forever
      // while each relink stacked another set on top.
      if (app && ctx) attachSectionPreview(app, linkBtn, heading, ctx.sourcePath);
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

  setupSlideCarousel(container, ".vizardry-block", "vizardry-block-active", visibleBlocks.length);
}
