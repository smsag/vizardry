/**
 * Visual-regression harness entry (browser bundle).
 *
 * Renders a representative canvas of every framework into a static page using
 * the *real* parse→render path, so Playwright can screenshot each and compare
 * against committed baselines. Fixtures are the shipped templates from
 * templates.ts — always valid, and self-maintaining as frameworks evolve.
 *
 * A minimal stub App/Ctx in read-only (preview) mode is enough: the renderers
 * take app/ctx as optional and only reach for the live editor on interaction,
 * which never happens here.
 */

import "../src/shared/obsidian-dom-polyfill"; // Obsidian HTMLElement polyfills (createEl, addClass, …)
import { Platform } from "obsidian"; // -> visual/obsidian.shim.ts (aliased by build.mjs)
import { dispatchVizardry } from "../src/vizardry-dispatch";
import { prepareForCapture } from "../src/renderer/controls";
import { ensureSketchDefs } from "../src/shared/sketch-defs";
import { generateCanvasTemplate } from "../src/templates";
import { ALL_FRAMEWORKS } from "../src/frameworks-registry";
import {
  FISHBONE_TEMPLATE, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE,
  OST_TEMPLATE, VENN_TEMPLATE, SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE, RACI_TEMPLATE,
  ROADMAP_TEMPLATE, PACE_LAYERS_TEMPLATE, CONCEPT_MAP_TEMPLATE, NODE_MAP_TEMPLATE,
  MATRIX_IMPACT_TEMPLATE, SCQA_TEMPLATE, JOURNEY_TEMPLATE, WHEEL_OF_LIFE_TEMPLATE,
  ODYSSEY_TEMPLATE, CIRCLE_OF_INFLUENCE_TEMPLATE, WHOLE_PERSON_TEMPLATE, RADAR_TEMPLATE,
  PROBLEM_TEMPLATE, TEST_CARD_TEMPLATE, COMPASS_TEMPLATE, PRO_CONTRA_TEMPLATE,
} from "../src/templates";

/** Strip the ```vizardry … ``` fence so only the inner block source remains. */
const inner = (tpl: string): string =>
  tpl.replace(/^```vizardry\n/, "").replace(/\n```\s*$/, "");

const framework = (id: string): string =>
  inner(generateCanvasTemplate(ALL_FRAMEWORKS.find(f => f.id === id)!));

// name → inner block source. Names must match visual.spec.ts.
const FIXTURES: Record<string, string> = {
  // A couple of grid canvases (skeleton + placeholders).
  bmc: framework("bmc"),
  swot: framework("swot"),
  // Bespoke renderers, from their shipped (content-rich) templates.
  fishbone: inner(FISHBONE_TEMPLATE),
  impact: inner(IMPACT_MAP_TEMPLATE),
  story: inner(STORY_MAP_TEMPLATE),
  mindmap: inner(MIND_MAP_TEMPLATE),
  ost: inner(OST_TEMPLATE),
  venn: inner(VENN_TEMPLATE),
  sipoc: inner(SIPOC_TEMPLATE),
  sipocflow: inner(SIPOC_FLOW_TEMPLATE),
  wardley: inner(WARDLEY_TEMPLATE),
  raci: inner(RACI_TEMPLATE),
  roadmap: inner(ROADMAP_TEMPLATE),
  pacelayers: inner(PACE_LAYERS_TEMPLATE),
  conceptmap: inner(CONCEPT_MAP_TEMPLATE),
  nodemap: inner(NODE_MAP_TEMPLATE),
  matrix: inner(MATRIX_IMPACT_TEMPLATE),
  scqa: inner(SCQA_TEMPLATE),
  journey: inner(JOURNEY_TEMPLATE),
  wheeloflife: inner(WHEEL_OF_LIFE_TEMPLATE),
  odyssey: inner(ODYSSEY_TEMPLATE),
  circleofinfluence: inner(CIRCLE_OF_INFLUENCE_TEMPLATE),
  wholeperson: inner(WHOLE_PERSON_TEMPLATE),
  radar: inner(RADAR_TEMPLATE),
  problem: inner(PROBLEM_TEMPLATE),
  testcard: inner(TEST_CARD_TEMPLATE),
  compass: inner(COMPASS_TEMPLATE),
  // A block that links to another canvas by title (canvas: target) → shows the
  // canvas-link button next to the block value.
  canvaslink: `type: swot
title: Linked SWOT
block: Strengths
  Senior team [team](canvas:Delivery Plan)
block: Opportunities
  New segment`,
  futureself: `type: futureself
title: Future Self
period: May – Jul 2025

block: As-Is
  Reactive; firefighting most days
  Strong craft, weak at delegation

block: To-Be
  Leading through others
  One clear strategic bet

block: Actions
  Hand off two recurring duties
  Weekly 1:1s with each report
  Write the strategy one-pager`,
  // Appended last: a new fixture's height shifts every later section's page
  // offset, and a sub-pixel shift changes the rounded height of their
  // element screenshots (canvaslink/futureself flipped by 1px).
  procontra: inner(PRO_CONTRA_TEMPLATE),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app: any = {
  workspace: {
    // ?edit renders canvases as in Live Preview, so edit affordances (drag
    // handles, "+" link handles) can be exercised by hand. Writes still fail —
    // there is no editor behind the fixtures.
    getActiveViewOfType: () => ({ getMode: () => (location.search.includes("edit") ? "source" : "preview") }),
    getLeavesOfType: () => [],
    openLinkText: () => {},
  },
  metadataCache: {
    getFileCache: () => ({ headings: [] }),
    getFirstLinkpathDest: () => null,
  },
  vault: {
    getFileByPath: () => null,
    getResourcePath: () => "",
    cachedRead: async () => "",
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = { sourcePath: "fixtures.md", getSectionInfo: () => null };

function render(): void {
  if (location.search.includes("mobile")) Platform.isMobile = true;
  if (location.search.includes("sketch")) {
    document.body.classList.add("vizardry-sketch");
    ensureSketchDefs(document);
  }
  // A dark vault. Combined with ?capturelight this is the case the export API
  // has to get right: the note is dark, the PDF page is white.
  if (location.search.includes("dark")) document.body.classList.add("theme-dark");

  const root = document.getElementById("app")!;
  for (const [name, source] of Object.entries(FIXTURES)) {
    const section = root.createEl("section", { attr: { "data-fixture": name } });
    section.createEl("h2", { text: name });
    const host = section.createEl("div", { cls: "fixture-host" });
    try {
      dispatchVizardry(source, host, ctx, app);
    } catch (err) {
      host.createEl("pre", { text: `render error: ${(err as Error).message}` });
    }
  }

  // Show what `api.exportCanvas(el, { light: true })` would capture: the same
  // preparation the real capture applies, left in place so Playwright can
  // photograph it. Deliberately not restored — this page is a fixture.
  if (location.search.includes("capturelight")) {
    for (const canvas of Array.from(root.querySelectorAll<HTMLElement>(".vizardry-canvas"))) {
      prepareForCapture(canvas, { light: true });
      // html-to-image paints `backgroundColor` behind the whole capture, and
      // several canvases tint with a partly transparent colour-mix. Without the
      // same ground here the dark page would show through those and the
      // snapshot would accuse the palette of a leak it doesn't have.
      canvas.style.background = "#ffffff";
    }
  }

  // Let any rAF-scheduled layout (initCanvas → applyFullWidth) settle and any
  // web font (sketch mode's Shantell Sans) finish loading, then signal readiness.
  const signalReady = (): void => document.body.setAttribute("data-ready", "1");
  requestAnimationFrame(() => {
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) void fonts.ready.then(() => setTimeout(signalReady, 50));
    else setTimeout(signalReady, 50);
  });
}

render();
