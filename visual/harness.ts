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

import "../src/test-setup"; // Obsidian HTMLElement polyfills (createEl, addClass, …)
import { Platform } from "obsidian"; // -> visual/obsidian.shim.ts (aliased by build.mjs)
import { dispatchVizardry } from "../src/vizardry-dispatch";
import { generateCanvasTemplate } from "../src/templates";
import { ALL_FRAMEWORKS } from "../src/frameworks-registry";
import {
  FISHBONE_TEMPLATE, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE,
  OST_TEMPLATE, VENN_TEMPLATE, SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE, RACI_TEMPLATE,
  ROADMAP_TEMPLATE, PACE_LAYERS_TEMPLATE, CONCEPT_MAP_TEMPLATE, NODE_MAP_TEMPLATE,
  MATRIX_IMPACT_TEMPLATE, SCQA_TEMPLATE, JOURNEY_TEMPLATE, WHEEL_OF_LIFE_TEMPLATE,
  ODYSSEY_TEMPLATE, CIRCLE_OF_INFLUENCE_TEMPLATE, WHOLE_PERSON_TEMPLATE, RADAR_TEMPLATE,
  PROBLEM_TEMPLATE, TEST_CARD_TEMPLATE, COMPASS_TEMPLATE,
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
  // Several canvases of mixed types in one fence → carousel (first panel shown).
  multicanvas: `type: swot
title: Strengths / Weaknesses
block: Strengths
  Fast, senior team
block: Weaknesses
  Thin on QA

type: problem, business
title: The Problem
vision: Ship weekly
issue: Releases slip
method: Automate the pipeline`,
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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app: any = {
  workspace: {
    getActiveViewOfType: () => ({ getMode: () => "preview" }),
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

/** Mirrors the plugin's ensureSketchDefs() so sketch baselines get the wobble. */
function injectSketchDefs(): void {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("id", "vzd-sketch-defs");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", "vzd-sketch-rough");
  const turb = document.createElementNS(NS, "feTurbulence");
  turb.setAttribute("type", "fractalNoise");
  turb.setAttribute("baseFrequency", "0.02");
  turb.setAttribute("numOctaves", "2");
  turb.setAttribute("seed", "7");
  turb.setAttribute("result", "noise");
  const disp = document.createElementNS(NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "noise");
  disp.setAttribute("scale", "1.1");
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  filter.appendChild(turb);
  filter.appendChild(disp);
  svg.appendChild(filter);
  document.body.appendChild(svg);
}

function render(): void {
  if (location.search.includes("mobile")) Platform.isMobile = true;
  if (location.search.includes("sketch")) {
    document.body.classList.add("vizardry-sketch");
    injectSketchDefs();
  }

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

  // Let any rAF-scheduled layout (initCanvas → applyFullWidth) settle and any
  // web font (sketch mode's Caveat) finish loading, then signal readiness.
  const signalReady = (): void => document.body.setAttribute("data-ready", "1");
  requestAnimationFrame(() => {
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) void fonts.ready.then(() => setTimeout(signalReady, 50));
    else setTimeout(signalReady, 50);
  });
}

render();
