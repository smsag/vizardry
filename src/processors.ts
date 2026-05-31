/**
 * Custom renderer registry — maps non-grid framework IDs to their
 * parse → render processor factories.
 *
 * Each entry is independent of the Obsidian plugin lifecycle.
 * main.ts imports this array and registers each processor; the logic
 * itself lives here so it can be read and tested without the Plugin class.
 *
 * Adding a new non-grid renderer:
 *   1. Add types to types.ts
 *   2. Create src/<framework>.ts (parser) and src/renderer/<framework>.ts (renderer)
 *   3. Add an entry here
 *   4. Export the renderer from src/renderer.ts
 *   5. Add template to src/templates.ts
 *   6. Add canvas wrapper class to the presentation selector in renderer/controls.ts
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { extractInlineLinks, buildLinkSupport } from "./shared/links";
import { parseImpactMap } from "./impact";
import { parseStoryMap } from "./story";
import { parseMindMap } from "./mindmap";
import { parseOST } from "./frameworks/ost";
import { parseVennDiagram } from "./venn";
import { parseWardleyMap } from "./wardley";
import { parseSIPOCFlow } from "./sipoc-flow";
import { parseSIPOC } from "./sipoc";
import { parseCarouselBlock } from "./carousel";
import {
  renderImpactMap, renderStoryMap, renderMindMap, renderOST,
  renderVennDiagram, renderSIPOC, renderSIPOCFlow, renderWardleyMap,
  renderError,
} from "./renderer";
import { renderCarouselBlock } from "./renderer/carousel";
import {
  IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE,
  OST_TEMPLATE, VENN_TEMPLATE, CAROUSEL_TEMPLATE,
  SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE,
} from "./templates";

export type ProcessorFn = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;

export interface CustomRenderer {
  id: string;
  label: string;
  template: string;
  createProcessor: (app: App) => ProcessorFn;
}

/** Modal-only entries: shown in the insert modal and get insert commands,
 *  but share an existing processor — no separate code block processor is registered. */
export interface ModalOnlyOption {
  id: string;
  label: string;
  template: string;
}

export const EXTRA_OPTIONS: ModalOnlyOption[] = [
  { id: "sipoc-flow", label: "SIPOC Flow Diagram", template: SIPOC_FLOW_TEMPLATE },
];

export const CUSTOM_RENDERERS: CustomRenderer[] = [
  {
    id: "impact",
    label: "Impact Map",
    template: IMPACT_MAP_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseImpactMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderImpactMap(result.data, el, resolver, navigateTo);
    },
  },
  {
    id: "story",
    label: "User Story Map",
    template: STORY_MAP_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseStoryMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderStoryMap(result.data, el);
    },
  },
  {
    id: "mindmap",
    label: "Mind Map",
    template: MIND_MAP_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseMindMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderMindMap(result.data, el, resolver, navigateTo);
    },
  },
  {
    id: "venn",
    label: "Venn Diagram",
    template: VENN_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource } = extractInlineLinks(source);
      const result = parseVennDiagram(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderVennDiagram(result.data, el, (target) => {
        void app.workspace.openLinkText(target, ctx.sourcePath, false);
      });
    },
  },
  {
    id: "ost",
    label: "Opportunity Solution Tree",
    template: OST_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseOST(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderOST(result.data, el, resolver, navigateTo);
    },
  },
  {
    id: "carousel",
    label: "Image Carousel",
    template: CAROUSEL_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource: carouselSrc } = extractInlineLinks(source);
      const result = parseCarouselBlock(carouselSrc);
      if (!result.ok) { renderError(result.error, el); return; }
      renderCarouselBlock(result.data, el, (src) => {
        const file = app.vault.getFileByPath(
          ctx.sourcePath.replace(/[^/]+$/, "") + src
        );
        if (!file) {
          console.warn(`Vizardry: carousel image not found in vault: ${src}`);
          return "";
        }
        return app.vault.getResourcePath(file);
      });
    },
  },
  {
    id: "sipoc",
    label: "SIPOC Diagram",
    template: SIPOC_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource: src } = extractInlineLinks(source);
      // Detect flow variant: first non-blank, non-comment line is "type: flow"
      const firstLine = src.split("\n").find(l => l.trim() && !l.trim().startsWith("#"))?.trim() ?? "";
      if (firstLine === "type: flow") {
        const body = src.replace(/^\s*type:\s*flow\s*\n?/i, "");
        const result = parseSIPOCFlow(body);
        if (!result.ok) { renderError(result.error, el); return; }
        renderSIPOCFlow(result.data, el);
        return;
      }
      const result = parseSIPOC(src);
      if (!result.ok) { renderError(result.error, el); return; }
      renderSIPOC(result.data, el);
    },
  },
  {
    id: "wardley",
    label: "Wardley Map",
    template: WARDLEY_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource } = extractInlineLinks(source);
      const result = parseWardleyMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderWardleyMap(result.data, el, app, ctx);
    },
  },
];
