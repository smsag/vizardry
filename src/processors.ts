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
import { resolveVaultPath } from "./shared/vault";
import { parseFishbone } from "./fishbone";
import { parseImpactMap } from "./impact";
import { parseStoryMap } from "./story";
import { parseMindMap } from "./mindmap";
import { parseOST } from "./frameworks/ost";
import { parseVennDiagram } from "./venn";
import { parseWardleyMap } from "./wardley";
import { parseSIPOCFlow } from "./sipoc-flow";
import { parseSIPOC } from "./sipoc";
import { parseCarouselBlock } from "./carousel";
import { parseRACIMatrix } from "./raci";
import { parseRoadmap } from "./roadmap";
import { parsePaceLayers } from "./pacelayers";
import { parseConceptMap } from "./conceptmap";
import { parseMatrix } from "./matrix";
import { parseSCQA } from "./scqa";
import {
  renderFishbone, renderImpactMap, renderStoryMap, renderMindMap, renderOST,
  renderVennDiagram, renderSIPOC, renderSIPOCFlow, renderWardleyMap, renderRACIMatrix,
  renderRoadmap, renderPaceLayers, renderConceptMap, renderMatrix, renderSCQA,
  renderError,
} from "./renderer";
import { renderCarouselBlock } from "./renderer/carousel";
import {
  FISHBONE_TEMPLATE, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE,
  OST_TEMPLATE, VENN_TEMPLATE, CAROUSEL_TEMPLATE,
  SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE, RACI_TEMPLATE,
  ROADMAP_TEMPLATE, PACE_LAYERS_TEMPLATE, CONCEPT_MAP_TEMPLATE,
  MATRIX_PAIN_TEMPLATE, MATRIX_OPP_TEMPLATE, MATRIX_IMPACT_TEMPLATE,
  SCQA_TEMPLATE, SCR_TEMPLATE,
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
  { id: "sipoc-flow",         label: "SIPOC Flow Diagram",    template: SIPOC_FLOW_TEMPLATE },
  { id: "opportunity-matrix", label: "Opportunity Matrix",    template: MATRIX_OPP_TEMPLATE },
  { id: "impact-matrix",      label: "Impact / Effort Matrix", template: MATRIX_IMPACT_TEMPLATE },
];

export const CUSTOM_RENDERERS: CustomRenderer[] = [
  {
    id: "fishbone",
    label: "Fishbone Diagram",
    template: FISHBONE_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseFishbone(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderFishbone(result.data, el, resolver, navigateTo, source, app, ctx);
    },
  },
  {
    id: "impact",
    label: "Impact Map",
    template: IMPACT_MAP_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseImpactMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderImpactMap(result.data, el, resolver, navigateTo, source, app, ctx);
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
      renderStoryMap(result.data, el, source, app, ctx, resolver, navigateTo);
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
      renderMindMap(result.data, el, resolver, navigateTo, source, app, ctx);
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
      }, source, app, ctx);
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
      renderOST(result.data, el, resolver, navigateTo, source, app, ctx);
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
        const file =
          app.metadataCache.getFirstLinkpathDest(src, ctx.sourcePath) ??
          app.vault.getFileByPath(resolveVaultPath(ctx.sourcePath, src));
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
      const firstLine = src.split("\n").find(l => l.trim() && !l.trim().startsWith("//"))?.trim() ?? "";
      if (firstLine === "type: flow") {
        const body = src.replace(/^\s*type:\s*flow\s*\n?/i, "");
        const result = parseSIPOCFlow(body);
        if (!result.ok) { renderError(result.error, el); return; }
        renderSIPOCFlow(result.data, el, source, app, ctx);
        return;
      }
      const result = parseSIPOC(src);
      if (!result.ok) { renderError(result.error, el); return; }
      renderSIPOC(result.data, el, source, app, ctx);
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
      renderWardleyMap(result.data, el, app, ctx, source);
    },
  },
  {
    id: "raci",
    label: "RACI Matrix",
    template: RACI_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource } = extractInlineLinks(source);
      const result = parseRACIMatrix(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderRACIMatrix(result.data, el, source, app, ctx);
    },
  },
  {
    id: "roadmap",
    label: "Now/Next/Later Roadmap",
    template: ROADMAP_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseRoadmap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderRoadmap(result.data, el, resolver, navigateTo, source, app, ctx);
    },
  },
  {
    id: "pacelayers",
    label: "Pace Layer Analysis",
    template: PACE_LAYERS_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const result = parsePaceLayers(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderPaceLayers(result.data, el, source, app, ctx);
    },
  },
  {
    id: "conceptmap",
    label: "Concept Map",
    template: CONCEPT_MAP_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const result = parseConceptMap(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderConceptMap(result.data, el, app, ctx, source);
    },
  },
  {
    id: "matrix",
    label: "Pain Point / Opportunity Matrix",
    template: MATRIX_PAIN_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseMatrix(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderMatrix(result.data, el, source, app, ctx, resolver, navigateTo);
    },
  },
  {
    id: "scqa",
    label: "SCQA Narrative",
    template: SCQA_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseSCQA(strippedSource, "scqa");
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderSCQA(result.data, el, resolver, navigateTo, source, app, ctx);
    },
  },
  {
    id: "scr",
    label: "SCR Narrative",
    template: SCR_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const { strippedSource, inlineLinks } = extractInlineLinks(source);
      const result = parseSCQA(strippedSource, "scr");
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks);
      renderSCQA(result.data, el, resolver, navigateTo, source, app, ctx);
    },
  },
];
