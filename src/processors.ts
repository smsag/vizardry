/**
 * Custom renderer registry — maps non-grid framework IDs to their
 * parse → render processor factories.
 *
 * Each entry is independent of the Obsidian plugin lifecycle. The vizardry
 * dispatcher (src/vizardry-dispatch.ts) imports this array and calls the
 * matching entry's processor once it has resolved a `type:` line to an id;
 * the logic itself lives here so it can be read and tested without the
 * Plugin class or the dispatcher.
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
import { parseSIPOC } from "./sipoc";
import { parseCarouselBlock } from "./carousel";
import { parseRACIMatrix } from "./raci";
import { parseRoadmap } from "./roadmap";
import { parsePaceLayers } from "./pacelayers";
import { parseConceptMap } from "./conceptmap";
import { parseNodeMap } from "./nodemap";
import { parseMatrix } from "./matrix";
import { parseScenario } from "./scenario";
import { parseSCQA } from "./scqa";
import { parseJourney } from "./journey";
import {
  renderFishbone, renderImpactMap, renderStoryMap, renderMindMap, renderOST,
  renderVennDiagram, renderSIPOC, renderWardleyMap, renderRACIMatrix,
  renderRoadmap, renderPaceLayers, renderConceptMap, renderNodeMap, renderMatrix, renderPlot, renderScenario, renderSCQA,
  renderJourneyMap,
  renderError,
} from "./renderer";
import { renderCarouselBlock } from "./renderer/carousel";
import {
  FISHBONE_TEMPLATE, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE,
  OST_TEMPLATE, VENN_TEMPLATE, CAROUSEL_TEMPLATE,
  SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE, RACI_TEMPLATE,
  ROADMAP_TEMPLATE, PACE_LAYERS_TEMPLATE, CONCEPT_MAP_TEMPLATE, NODE_MAP_TEMPLATE,
  MATRIX_PAIN_TEMPLATE, MATRIX_OPP_TEMPLATE, MATRIX_IMPACT_TEMPLATE, MATRIX_ASSUMPTION_TEMPLATE,
  MATRIX_PLOT_TEMPLATE, SCENARIO_TEMPLATE,
  SCQA_TEMPLATE, SCR_TEMPLATE,
  JOURNEY_TEMPLATE, SERVICE_BLUEPRINT_TEMPLATE,
} from "./templates";

/**
 * `parseSource` has the outer `type:` line blanked out (safe to feed to this
 * framework's own parser); `fullSource` is the pristine, untouched block
 * content (needed for `initCanvas`'s title-parsing, `vzSource` write-back
 * fingerprint, and copy-to-clipboard reconstruction — see the doc comment on
 * `dispatchVizardry` in src/vizardry-dispatch.ts for why these must differ).
 * `variant` is the value after the first comma in a compound `type:` line
 * (e.g. "pain" from "type: matrix, pain"), or undefined — only matrix and
 * pacelayers use it; every other handler ignores it.
 */
export type ProcessorFn = (
  parseSource: string,
  fullSource: string,
  variant: string | undefined,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => void;

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
  { id: "opportunity-matrix", label: "Opportunity Matrix",    template: MATRIX_OPP_TEMPLATE },
  { id: "impact-matrix",      label: "Impact / Effort Matrix", template: MATRIX_IMPACT_TEMPLATE },
  { id: "assumption-matrix",  label: "Assumption Map",        template: MATRIX_ASSUMPTION_TEMPLATE },
  { id: "plot-matrix",        label: "Plotted Matrix",        template: MATRIX_PLOT_TEMPLATE },
  { id: "sipoc-flow",         label: "SIPOC Flow Diagram",    template: SIPOC_FLOW_TEMPLATE },
  { id: "service-blueprint",  label: "Service Blueprint",     template: SERVICE_BLUEPRINT_TEMPLATE },
];

export const CUSTOM_RENDERERS: CustomRenderer[] = [
  {
    id: "fishbone",
    label: "Fishbone Diagram",
    template: FISHBONE_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseFishbone(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderFishbone(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "impact",
    label: "Impact Map",
    template: IMPACT_MAP_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseImpactMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderImpactMap(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "story",
    label: "User Story Map",
    template: STORY_MAP_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseStoryMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderStoryMap(result.data, el, fullSource, app, ctx, resolver, navigateTo);
    },
  },
  {
    id: "mindmap",
    label: "Mind Map",
    template: MIND_MAP_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseMindMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderMindMap(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "venn",
    label: "Venn Diagram",
    template: VENN_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource } = extractInlineLinks(parseSource);
      const result = parseVennDiagram(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderVennDiagram(result.data, el, (target) => {
        void app.workspace.openLinkText(target, ctx.sourcePath, false);
      }, fullSource, app, ctx);
    },
  },
  {
    id: "ost",
    label: "Opportunity Solution Tree",
    template: OST_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseOST(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderOST(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "carousel",
    label: "Image Carousel",
    template: CAROUSEL_TEMPLATE,
    createProcessor: (app) => (parseSource, _fullSource, _variant, el, ctx) => {
      const { strippedSource: carouselSrc } = extractInlineLinks(parseSource);
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
    createProcessor: (app) => (parseSource, fullSource, variant, el, ctx) => {
      const { strippedSource: src } = extractInlineLinks(parseSource);
      const result = parseSIPOC(src, variant);
      if (!result.ok) { renderError(result.error, el); return; }
      renderSIPOC(result.data, el, fullSource, app, ctx);
    },
  },
  {
    id: "wardley",
    label: "Wardley Map",
    template: WARDLEY_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource } = extractInlineLinks(parseSource);
      const result = parseWardleyMap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderWardleyMap(result.data, el, app, ctx, fullSource);
    },
  },
  {
    id: "raci",
    label: "RACI Matrix",
    template: RACI_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseRACIMatrix(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderRACIMatrix(result.data, el, fullSource, app, ctx, resolver, navigateTo);
    },
  },
  {
    id: "roadmap",
    label: "Now/Next/Later Roadmap",
    template: ROADMAP_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseRoadmap(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderRoadmap(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "pacelayers",
    label: "Pace Layer Analysis",
    template: PACE_LAYERS_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parsePaceLayers(strippedSource, variant);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderPaceLayers(result.data, el, fullSource, app, ctx, resolver, navigateTo);
    },
  },
  {
    id: "conceptmap",
    label: "Concept Map",
    template: CONCEPT_MAP_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const result = parseConceptMap(parseSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderConceptMap(result.data, el, app, ctx, fullSource);
    },
  },
  {
    id: "nodemap",
    label: "Node Map",
    template: NODE_MAP_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const result = parseNodeMap(parseSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderNodeMap(result.data, el, app, ctx, fullSource);
    },
  },
  {
    id: "matrix",
    label: "Pain Point / Opportunity Matrix",
    template: MATRIX_PAIN_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      // `type: matrix, scenario` is an accepted alias for the 2×2 scenario
      // matrix — same surface grammar, but a distinct engine (named quadrants,
      // no heat) so it delegates rather than sharing the priority-grid parser.
      if (variant === "scenario") {
        const sc = parseScenario(strippedSource);
        if (!sc.ok) { renderError(sc.error, el); return; }
        renderScenario(sc.data, el, fullSource, app, ctx, resolver, navigateTo);
        return;
      }
      const result = parseMatrix(strippedSource, variant);
      if (!result.ok) { renderError(result.error, el); return; }
      if (result.data.layout === "plot") {
        renderPlot(result.data, el, fullSource, app, ctx, resolver, navigateTo);
      } else {
        renderMatrix(result.data, el, fullSource, app, ctx, resolver, navigateTo);
      }
    },
  },
  {
    id: "scenario",
    label: "Scenario Matrix",
    template: SCENARIO_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseScenario(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderScenario(result.data, el, fullSource, app, ctx, resolver, navigateTo);
    },
  },
  {
    id: "scqa",
    label: "SCQA Narrative",
    template: SCQA_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseSCQA(strippedSource, "scqa");
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderSCQA(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "scr",
    label: "SCR Narrative",
    template: SCR_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseSCQA(strippedSource, "scr");
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderSCQA(result.data, el, resolver, navigateTo, fullSource, app, ctx);
    },
  },
  {
    id: "journey",
    label: "Customer Journey Map",
    template: JOURNEY_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, variant, el, ctx) => {
      const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
      const result = parseJourney(strippedSource, variant);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
      renderJourneyMap(result.data, el, fullSource, app, ctx, resolver, navigateTo);
    },
  },
];
