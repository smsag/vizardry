import type { CompassData } from "../types/compass";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings, renderHeadingLink } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";

/**
 * Product Compass — a vertical one-pager brief that indexes a feature's
 * discovery: Challenge (forces / problem / insights) → North Star → Solution &
 * Test ideas (the link-out hub) → Go-To-Market / Pricing. Reuses
 * `renderHeadingLink` so `problem:` and `idea:` lines carry heading / ticket /
 * `canvas:` links.
 */
export function renderCompass(
  data: CompassData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source, resolver, navigateTo } = rc;
  const editable = !!(app && ctx && source !== undefined && isEditModeActive(app));
  const defaultTitle = "Product Compass";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (editable && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "compass", title, undefined, source, onTitleEdit, app, ctx);

  const root = container.createEl("div", { cls: "vzd-compass" });
  const sourcePath = ctx?.sourcePath;

  /** A numbered section with an eyebrow; returns its body element. */
  const section = (n: number, label: string): HTMLElement => {
    const sec = root.createEl("div", { cls: "vzd-compass-section" });
    const head = sec.createEl("div", { cls: "vzd-compass-eyebrow" });
    head.createEl("span", { cls: "vzd-compass-num", text: String(n) });
    head.createEl("span", { text: label });
    return sec.createEl("div", { cls: "vzd-compass-body" });
  };
  const subLabel = (parent: HTMLElement, text: string): void => {
    parent.createEl("div", { cls: "vzd-compass-sublabel", text });
  };
  const placeholder = (parent: HTMLElement, text: string): void => {
    parent.createEl("div", { cls: "vzd-compass-placeholder", text });
  };
  /** A line of text with an optional link icon resolved from its text. */
  const linkedLine = (parent: HTMLElement, cls: string, text: string): void => {
    const el = parent.createEl("div", { cls });
    el.createEl("span", { cls: "vzd-compass-line-text", text });
    renderHeadingLink(el, text, resolver, navigateTo, app, sourcePath);
  };

  // ── 1 · Challenge ───────────────────────────────────────────────────────────
  const challenge = section(1, "Challenge");
  const hasChallenge = data.forces.length || data.problem.length || data.insights.length;
  if (data.forces.length) {
    subLabel(challenge, "Forces");
    const list = challenge.createEl("div", { cls: "vzd-compass-forces" });
    for (const f of data.forces) linkedLine(list, "vzd-compass-force", f);
  }
  if (data.problem.length) {
    subLabel(challenge, "Problem");
    for (const p of data.problem) linkedLine(challenge, "vzd-compass-problem", p);
  }
  if (data.insights.length) {
    subLabel(challenge, "Case / Insights");
    const stats = challenge.createEl("div", { cls: "vzd-compass-stats" });
    for (const ins of data.insights) {
      const tile = stats.createEl("div", { cls: "vzd-compass-stat" });
      if (ins.figure) tile.createEl("div", { cls: "vzd-compass-stat-figure", text: ins.figure });
      tile.createEl("div", { cls: "vzd-compass-stat-text", text: ins.text });
    }
  }
  if (!hasChallenge) placeholder(challenge, "What forces make this worth doing? What's the problem, and what's the evidence?");

  // ── 2 · North Star ──────────────────────────────────────────────────────────
  const north = section(2, "North Star");
  if (data.northStar) {
    const banner = north.createEl("div", { cls: "vzd-compass-northstar" });
    banner.createEl("span", { cls: "vzd-compass-northstar-star", text: "★" });
    banner.createEl("span", { cls: "vzd-compass-northstar-text", text: data.northStar });
  } else {
    placeholder(north, "The one outcome that signals success.");
  }

  // ── 3 · Solution & Test Ideas ───────────────────────────────────────────────
  const solutions = section(3, "Solution & Test Ideas");
  if (data.ideas.length) {
    const list = solutions.createEl("div", { cls: "vzd-compass-ideas" });
    for (const idea of data.ideas) linkedLine(list, "vzd-compass-idea", idea);
  } else {
    placeholder(solutions, "Ideas and experiments — link out to an OST or a Test Card.");
  }

  // ── 4 · Go-To-Market / Pricing ──────────────────────────────────────────────
  const gtm = section(4, "Go-To-Market / Pricing");
  if (data.gtm.length || data.pricing.length) {
    if (data.gtm.length) {
      subLabel(gtm, "Go-To-Market");
      for (const g of data.gtm) linkedLine(gtm, "vzd-compass-line", g);
    }
    if (data.pricing.length) {
      subLabel(gtm, "Pricing");
      for (const p of data.pricing) linkedLine(gtm, "vzd-compass-line", p);
    }
  } else {
    placeholder(gtm, "How it reaches users, and how it's priced.");
  }

  renderCanvasWarnings(container, data.warnings);
}
