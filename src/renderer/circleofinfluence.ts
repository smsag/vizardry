import type { CircleOfInfluenceData, CircleItem, CircleTier } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { t } from "../i18n";

// Square viewBox; the three rings are concentric circles centred in it.
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

/** Mid-band radius where a scattered tier's item chips are placed. */
function chipRadius(tier: CircleTier, radii: Record<CircleTier, number>): number {
  if (tier === "concern") return (radii.influence + radii.concern) / 2;
  // Innermost visible ring when there's no control disc — pull chips inward.
  if (radii.control === 0) return radii.influence * 0.58;
  return (radii.control + radii.influence) / 2;
}

/** Scatter a tier's chips evenly around its band, offset so the top stays clear
 *  for the ring label. */
function placeRadial(wrap: HTMLElement, tierItems: CircleItem[], tier: CircleTier, r: number): void {
  const n = tierItems.length;
  const step = (2 * Math.PI) / n;
  tierItems.forEach((item, i) => {
    const theta = -Math.PI / 2 + step / 2 + i * step;
    const chip = wrap.createEl("div", { cls: `vzd-coi-chip vzd-coi-chip--${tier}`, text: item.text });
    chip.style.left = `${((C + r * Math.cos(theta)) / VIEW) * 100}%`;
    chip.style.top = `${((C + r * Math.sin(theta)) / VIEW) * 100}%`;
  });
}

/** Stack the innermost (control) chips vertically in the centre disc — the disc
 *  is too small to scatter them around without overlap. */
function placeControlStack(wrap: HTMLElement, tierItems: CircleItem[]): void {
  const stack = wrap.createEl("div", { cls: "vzd-coi-control-stack" });
  for (const item of tierItems) {
    stack.createEl("div", { cls: "vzd-coi-chip vzd-coi-chip--control", text: item.text });
  }
}

function placeChips(wrap: HTMLElement, items: CircleItem[], tier: CircleTier, radii: Record<CircleTier, number>): void {
  const tierItems = items.filter(it => it.tier === tier);
  if (tierItems.length === 0) return;
  if (tier === "control") placeControlStack(wrap, tierItems);
  else placeRadial(wrap, tierItems, tier, chipRadius(tier, radii));
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
  const radii = ringRadii(hasControl);

  const wrap = container.createEl("div", { cls: "vzd-coi-wrap" });

  const svg = createSvgEl("svg", { viewBox: `0 0 ${VIEW} ${VIEW}`, class: "vzd-coi-svg", role: "img", "aria-label": title }) as SVGSVGElement;

  // Discs from outer to inner so the inner bands paint over the outer ones.
  const tiers: CircleTier[] = hasControl ? ["concern", "influence", "control"] : ["concern", "influence"];
  for (const tier of tiers) {
    svg.appendChild(createSvgEl("circle", { cx: String(C), cy: String(C), r: String(radii[tier]), class: `vzd-coi-disc vzd-coi-disc--${tier}` }));
  }

  // Ring labels sit at the top of each band (control's at the centre).
  for (const tier of tiers) {
    const y = tier === "control" ? C - radii.control + 15 : C - radii[tier] + 18;
    const label = createSvgEl("text", { x: String(C), y: String(y), class: `vzd-coi-ring-label vzd-coi-ring-label--${tier}`, "text-anchor": "middle" });
    label.textContent = t(TIER_LABEL[tier] as Parameters<typeof t>[0]);
    svg.appendChild(label);
  }

  wrap.appendChild(svg);

  for (const tier of tiers) placeChips(wrap, data.items, tier, radii);
}
