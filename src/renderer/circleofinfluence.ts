import type { CircleOfInfluenceData, CircleItem, CircleTier } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { t } from "../i18n";
import { createInlineEl } from "../shared/inline-markdown";

/**
 * Circle of Influence & Concern: the concentric rings as a diagram, each band
 * showing how many items it holds, and the items themselves listed beside it
 * in one group per ring, tinted like the ring.
 *
 * The items used to be chips scattered round the bands. A chip is wide and a
 * band only ~60px deep, so outside the very top and bottom of the circle a
 * chip stuck out across both edges of its band and seemed to sit on the line
 * between two rings, which is the one thing this canvas must not blur. Lists
 * read at any count (up to the parser's eight per ring), on a phone and in an
 * export; the rings keep the picture of where each group sits.
 */

// Square viewBox; the rings are concentric circles centred in it.
const VIEW = 400;
const C = 200;

const TIER_LABEL: Record<CircleTier, string> = {
  concern: "coi.concern",
  influence: "coi.influence",
  control: "coi.control",
};

/** Ring outer radii, chosen so bands stay legible with or without a control disc. */
function ringRadii(hasControl: boolean): Record<CircleTier, number> {
  return hasControl
    ? { concern: 190, influence: 132, control: 80 }
    : { concern: 190, influence: 108, control: 0 };
}

/** Where a band's item count sits: low in the band, under its label. */
function countY(tier: CircleTier, radii: Record<CircleTier, number>): number {
  if (tier === "concern") return C + (radii.influence + radii.concern) / 2;
  if (tier === "control") return C + radii.control * 0.45;
  return C + (radii.control > 0 ? (radii.control + radii.influence) / 2 : radii.influence * 0.5);
}

const tierName = (tier: CircleTier): string => t(TIER_LABEL[tier] as Parameters<typeof t>[0]);

function renderDiagram(parent: HTMLElement, items: CircleItem[], tiers: CircleTier[], title: string): void {
  const radii = ringRadii(tiers.includes("control"));
  const svg = createSvgEl("svg", { viewBox: `0 0 ${VIEW} ${VIEW}`, class: "vzd-coi-svg", role: "img", "aria-label": title }) as SVGSVGElement;

  // Discs from outer to inner so the inner bands paint over the outer ones.
  for (const tier of tiers) {
    svg.appendChild(createSvgEl("circle", { cx: String(C), cy: String(C), r: String(radii[tier]), class: `vzd-coi-disc vzd-coi-disc--${tier}` }));
  }

  for (const tier of tiers) {
    // Ring labels sit at the top of each band (control's at the top of its disc).
    const y = tier === "control" ? C - radii.control + 24 : C - radii[tier] + 26;
    const label = createSvgEl("text", { x: String(C), y: String(y), class: `vzd-coi-ring-label vzd-coi-ring-label--${tier}`, "text-anchor": "middle" });
    label.textContent = tierName(tier);
    svg.appendChild(label);

    const count = createSvgEl("text", {
      x: String(C), y: String(countY(tier, radii)),
      class: `vzd-coi-count vzd-coi-count--${tier}`, "text-anchor": "middle", "dominant-baseline": "middle",
    });
    count.textContent = String(items.filter(it => it.tier === tier).length);
    svg.appendChild(count);
  }

  parent.createEl("div", { cls: "vzd-coi-diagram" }).appendChild(svg);
}

function renderLists(parent: HTMLElement, items: CircleItem[], tiers: CircleTier[]): void {
  const lists = parent.createEl("div", { cls: "vzd-coi-lists" });
  // Inside out: what you control first, the way the framework asks you to look.
  for (const tier of [...tiers].reverse()) {
    const tierItems = items.filter(it => it.tier === tier);
    const group = lists.createEl("div", { cls: `vzd-coi-group vzd-coi-group--${tier}` });
    const head = group.createEl("div", { cls: "vzd-coi-group-head" });
    head.createEl("span", { cls: `vzd-coi-swatch vzd-coi-swatch--${tier}` }).setAttribute("aria-hidden", "true");
    head.createEl("span", { cls: "vzd-coi-group-name", text: tierName(tier) });
    head.createEl("span", { cls: "vzd-coi-group-count", text: String(tierItems.length) });
    const list = group.createEl("ul", { cls: "vzd-coi-list" });
    for (const item of tierItems) createInlineEl(list, "li", "vzd-coi-item", item.text);
  }
}

export function renderCircleOfInfluence(
  data: CircleOfInfluenceData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Circle of Influence";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "circleofinfluence", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const hasControl = data.items.some(it => it.tier === "control");
  const tiers: CircleTier[] = hasControl ? ["concern", "influence", "control"] : ["concern", "influence"];

  const wrap = container.createEl("div", { cls: "vzd-coi-wrap" });
  renderDiagram(wrap, data.items, tiers, title);
  renderLists(wrap, data.items, tiers);
}
