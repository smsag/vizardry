import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { CompassData } from "../types/compass";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings, renderHeadingLink } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { activateInlineEdit } from "./inline-edit";
import {
  readCompassValue, writeCompassValue, removeCompassValue, insertCompassValue,
} from "../shared/compass-edit";

/**
 * Product Compass — a vertical one-pager brief that indexes a feature's
 * discovery: Challenge (forces / problem / insights) → North Star → Solution &
 * Test ideas (the link-out hub) → Go-To-Market / Pricing. Reuses
 * `renderHeadingLink` so `problem:` and `idea:` lines carry heading / ticket /
 * `canvas:` links, and edits in place in Live Preview (write-back per line).
 */

interface CompassEdit {
  app: App;
  ctx: MarkdownPostProcessorContext;
  container: HTMLElement;
}

const ADD_PLACEHOLDER: Record<string, string> = {
  forces: "New force",
  problem: "Problem statement",
  insight: "Figure | insight",
  northstar: "The one outcome that signals success",
  idea: "New idea",
  gtm: "Go-to-market note",
  pricing: "Pricing note",
};

const failed = (): void => { new Notice("Vizardry: couldn't save — open the note in editing mode."); };

export function renderCompass(
  data: CompassData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source, resolver, navigateTo } = rc;
  const editable = !!(app && ctx && source !== undefined && isEditModeActive(app));
  const edit: CompassEdit | undefined = editable ? { app: app!, ctx: ctx!, container } : undefined;
  const defaultTitle = "Product Compass";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (editable && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "compass", title, undefined, source, onTitleEdit, app, ctx);

  const root = container.createEl("div", { cls: "vzd-compass" });
  const sourcePath = ctx?.sourcePath;

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

  /** A "+ Add" affordance that appends a new line of `key`. */
  const addButton = (parent: HTMLElement, key: string): void => {
    if (!edit) return;
    const btn = parent.createEl("div", { cls: "vzd-compass-add", text: `+ ${key === "insight" ? "insight" : key}` });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!insertCompassValue(edit.app, edit.ctx, edit.container, key, ADD_PLACEHOLDER[key] ?? "New")) failed();
    });
  };

  /** A text line with an optional link icon; click-to-edit + delete in edit mode. */
  const linkedLine = (parent: HTMLElement, cls: string, text: string, key: string, index: number): void => {
    const el = parent.createEl("div", { cls });
    const span = el.createEl("span", { cls: "vzd-compass-line-text", text });
    renderHeadingLink(el, text, resolver, navigateTo, app, sourcePath);
    if (!edit) return;
    el.addClass("vzd-compass-editable");
    span.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".vzd-card-link-btn, .vzd-compass-del")) return;
      e.stopPropagation();
      const raw = readCompassValue(edit.app, edit.ctx, edit.container, key, index) ?? text;
      activateInlineEdit(span, raw, (v) => {
        if (!writeCompassValue(edit.app, edit.ctx, edit.container, key, index, v)) failed();
      });
    });
    const del = el.createEl("button", { cls: "vzd-compass-del vzd-btn", text: "×" });
    del.setAttribute("aria-label", "Delete");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!removeCompassValue(edit.app, edit.ctx, edit.container, key, index)) failed();
    });
  };

  // ── 1 · Challenge ───────────────────────────────────────────────────────────
  const challenge = section(1, "Challenge");
  const hasChallenge = data.forces.length || data.problem.length || data.insights.length;
  if (data.forces.length || edit) {
    subLabel(challenge, "Forces");
    const list = challenge.createEl("div", { cls: "vzd-compass-forces" });
    data.forces.forEach((f, i) => linkedLine(list, "vzd-compass-force", f, "forces", i));
    addButton(list, "forces");
  }
  if (data.problem.length || edit) {
    subLabel(challenge, "Problem");
    data.problem.forEach((p, i) => linkedLine(challenge, "vzd-compass-problem", p, "problem", i));
    addButton(challenge, "problem");
  }
  if (data.insights.length || edit) {
    subLabel(challenge, "Case / Insights");
    const stats = challenge.createEl("div", { cls: "vzd-compass-stats" });
    data.insights.forEach((ins, i) => {
      const tile = stats.createEl("div", { cls: "vzd-compass-stat" });
      if (ins.figure) tile.createEl("div", { cls: "vzd-compass-stat-figure", text: ins.figure });
      tile.createEl("div", { cls: "vzd-compass-stat-text", text: ins.text });
      if (!edit) return;
      tile.addClass("vzd-compass-editable");
      tile.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".vzd-compass-del")) return;
        const raw = readCompassValue(edit.app, edit.ctx, edit.container, "insight", i) ?? (ins.figure ? `${ins.figure} | ${ins.text}` : ins.text);
        activateInlineEdit(tile, raw, (v) => {
          if (!writeCompassValue(edit.app, edit.ctx, edit.container, "insight", i, v)) failed();
        });
      });
      const del = tile.createEl("button", { cls: "vzd-compass-del vzd-btn", text: "×" });
      del.setAttribute("aria-label", "Delete");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!removeCompassValue(edit.app, edit.ctx, edit.container, "insight", i)) failed();
      });
    });
    addButton(challenge, "insight");
  }
  if (!hasChallenge && !edit) placeholder(challenge, "What forces make this worth doing? What's the problem, and what's the evidence?");

  // ── 2 · North Star ──────────────────────────────────────────────────────────
  const north = section(2, "North Star");
  if (data.northStar) {
    const banner = north.createEl("div", { cls: "vzd-compass-northstar" });
    banner.createEl("span", { cls: "vzd-compass-northstar-star", text: "★" });
    const text = banner.createEl("span", { cls: "vzd-compass-northstar-text", text: data.northStar });
    if (edit) {
      text.addClass("vzd-compass-editable");
      text.addEventListener("click", (e) => {
        e.stopPropagation();
        const raw = readCompassValue(edit.app, edit.ctx, edit.container, "northstar", 0) ?? data.northStar;
        activateInlineEdit(text, raw, (v) => {
          if (!writeCompassValue(edit.app, edit.ctx, edit.container, "northstar", 0, v)) failed();
        });
      });
    }
  } else if (edit) {
    const ph = north.createEl("div", { cls: "vzd-compass-placeholder vzd-compass-editable", text: ADD_PLACEHOLDER.northstar });
    ph.addEventListener("click", (e) => {
      e.stopPropagation();
      activateInlineEdit(ph, "", (v) => {
        if (!insertCompassValue(edit.app, edit.ctx, edit.container, "northstar", v)) failed();
      }, { blurGuardMs: 0 });
    });
  } else {
    placeholder(north, "The one outcome that signals success.");
  }

  // ── 3 · Solution & Test Ideas ───────────────────────────────────────────────
  const solutions = section(3, "Solution & Test Ideas");
  if (data.ideas.length || edit) {
    const list = solutions.createEl("div", { cls: "vzd-compass-ideas" });
    data.ideas.forEach((idea, i) => linkedLine(list, "vzd-compass-idea", idea, "idea", i));
    addButton(list, "idea");
  } else {
    placeholder(solutions, "Ideas and experiments — link out to an OST or a Test Card.");
  }

  // ── 4 · Go-To-Market / Pricing ──────────────────────────────────────────────
  const gtm = section(4, "Go-To-Market / Pricing");
  if (data.gtm.length || data.pricing.length || edit) {
    subLabel(gtm, "Go-To-Market");
    data.gtm.forEach((g, i) => linkedLine(gtm, "vzd-compass-line", g, "gtm", i));
    addButton(gtm, "gtm");
    subLabel(gtm, "Pricing");
    data.pricing.forEach((p, i) => linkedLine(gtm, "vzd-compass-line", p, "pricing", i));
    addButton(gtm, "pricing");
  } else {
    placeholder(gtm, "How it reaches users, and how it's priced.");
  }

  renderCanvasWarnings(container, data.warnings);
}
