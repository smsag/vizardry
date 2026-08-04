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
  OST_TEMPLATE, VENN_TEMPLATE, SIPOC_TEMPLATE, WARDLEY_TEMPLATE, RACI_TEMPLATE,
  ROADMAP_TEMPLATE, PACE_LAYERS_TEMPLATE, CONCEPT_MAP_TEMPLATE, NODE_MAP_TEMPLATE,
  MATRIX_IMPACT_TEMPLATE, SCQA_TEMPLATE, JOURNEY_TEMPLATE, WHEEL_OF_LIFE_TEMPLATE,
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

function render(): void {
  if (location.search.includes("mobile")) Platform.isMobile = true;

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

  // Let any rAF-scheduled layout (initCanvas → applyFullWidth) settle, then
  // signal readiness for the screenshot.
  requestAnimationFrame(() => {
    setTimeout(() => document.body.setAttribute("data-ready", "1"), 50);
  });
}

render();
