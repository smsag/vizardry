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
 * Most renderers share one of two pipelines — `linked` (strip inline links,
 * parse, render with a heading-link resolver) and `plain` (parse raw, no
 * resolver) — so an entry is usually a single declarative row. Only Venn and
 * the image carousel, which need bespoke link/asset handling, spell their
 * processor out in full.
 *
 * Adding a new non-grid renderer:
 *   1. Add types to types.ts
 *   2. Create src/<framework>.ts (parser) and src/renderer/<framework>.ts (renderer)
 *   3. Add an entry here (usually `linked(parseX, renderX)`)
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
import { parseSCQA } from "./scqa";
import { parseJourney } from "./journey";
import { parseWheelOfLife } from "./wheeloflife";
import { parseOdyssey } from "./odyssey";
import { parseCircleOfInfluence } from "./circleofinfluence";
import { parseWholePerson } from "./wholeperson";
import { parseRadar } from "./radar";
import { parseProblem } from "./problem";
import { parseTestCard } from "./testcard";
import {
  renderFishbone, renderImpactMap, renderStoryMap, renderMindMap, renderOST,
  renderVennDiagram, renderSIPOC, renderWardleyMap, renderRACIMatrix,
  renderRoadmap, renderPaceLayers, renderConceptMap, renderNodeMap, renderMatrix, renderSCQA,
  renderJourneyMap, renderWheelOfLife, renderOdyssey,
  renderCircleOfInfluence, renderWholePerson, renderRadar, renderProblem, renderTestCard,
  renderError,
} from "./renderer";
import { renderCarouselBlock } from "./renderer/carousel";
import type { RenderContext } from "./renderer/render-context";
import {
  FISHBONE_TEMPLATE, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE,
  OST_TEMPLATE, VENN_TEMPLATE, CAROUSEL_TEMPLATE,
  SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE, RACI_TEMPLATE,
  ROADMAP_TEMPLATE, PACE_LAYERS_TEMPLATE, CONCEPT_MAP_TEMPLATE, NODE_MAP_TEMPLATE,
  MATRIX_OPP_TEMPLATE, MATRIX_IMPACT_TEMPLATE, MATRIX_ASSUMPTION_TEMPLATE,
  MATRIX_SCENARIO_TEMPLATE, MATRIX_PLOT_TEMPLATE,
  SCQA_TEMPLATE, SCR_TEMPLATE,
  JOURNEY_TEMPLATE, SERVICE_BLUEPRINT_TEMPLATE,
  WHEEL_OF_LIFE_TEMPLATE, ODYSSEY_TEMPLATE,
  CIRCLE_OF_INFLUENCE_TEMPLATE, WHOLE_PERSON_TEMPLATE, RADAR_TEMPLATE,
  PROBLEM_TEMPLATE, TEST_CARD_TEMPLATE,
} from "./templates";

/**
 * `parseSource` has the outer `type:` line blanked out (safe to feed to this
 * framework's own parser); `fullSource` is the pristine, untouched block
 * content (needed for `initCanvas`'s title-parsing, `vzSource` write-back
 * fingerprint, and copy-to-clipboard reconstruction — see the doc comment on
 * `dispatchVizardry` in src/vizardry-dispatch.ts for why these must differ).
 * `variant` is the value after the first comma in a compound `type:` line
 * (e.g. "pain" from "type: matrix, pain"), or undefined — forwarded to the
 * parser by `linked`; parsers that don't take one ignore it.
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

// ── Shared pipelines ──────────────────────────────────────────────────────────

type ParseFn<T> = (src: string, variant?: string) => { ok: true; data: T } | { ok: false; error: string };
type RenderFn<T> = (data: T, el: HTMLElement, rc: RenderContext) => void;

/**
 * Standard pipeline for a link-aware renderer: strip inline link/ticket
 * annotations, parse the cleaned source, then render with a RenderContext
 * carrying the editor plumbing plus a heading-link resolver. Renderers that
 * ignore the resolver (e.g. Wardley, SIPOC) simply don't read it off the
 * context — passing it is harmless.
 */
function linked<T>(parse: ParseFn<T>, render: RenderFn<T>): (app: App) => ProcessorFn {
  return (app) => (parseSource, fullSource, variant, el, ctx) => {
    const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(parseSource);
    const result = parse(strippedSource, variant);
    if (!result.ok) { renderError(result.error, el); return; }
    const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks);
    render(result.data, el, { source: fullSource, app, ctx, resolver, navigateTo });
  };
}

/**
 * Pipeline for renderers that parse the raw source verbatim — their DSL uses
 * bracket syntax the inline-link stripper would mangle — and need no
 * heading-link resolver, just the editor plumbing.
 */
function plain<T>(parse: ParseFn<T>, render: RenderFn<T>): (app: App) => ProcessorFn {
  return (app) => (parseSource, fullSource, _variant, el, ctx) => {
    const result = parse(parseSource);
    if (!result.ok) { renderError(result.error, el); return; }
    render(result.data, el, { source: fullSource, app, ctx });
  };
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
  { id: "scenario-matrix",    label: "Scenario Matrix",       template: MATRIX_SCENARIO_TEMPLATE },
  { id: "plot-matrix",        label: "Plotted Matrix",        template: MATRIX_PLOT_TEMPLATE },
  { id: "sipoc-flow",         label: "SIPOC Flow Diagram",    template: SIPOC_FLOW_TEMPLATE },
  { id: "service-blueprint",  label: "Service Blueprint",     template: SERVICE_BLUEPRINT_TEMPLATE },
];

export const CUSTOM_RENDERERS: CustomRenderer[] = [
  { id: "fishbone", label: "Fishbone Diagram",          template: FISHBONE_TEMPLATE,   createProcessor: linked(parseFishbone, renderFishbone) },
  { id: "impact",   label: "Impact Map",                template: IMPACT_MAP_TEMPLATE, createProcessor: linked(parseImpactMap, renderImpactMap) },
  { id: "story",    label: "User Story Map",            template: STORY_MAP_TEMPLATE,  createProcessor: linked(parseStoryMap, renderStoryMap) },
  { id: "mindmap",  label: "Mind Map",                  template: MIND_MAP_TEMPLATE,   createProcessor: linked(parseMindMap, renderMindMap) },

  // Venn opens arbitrary link targets (not headings), so it needs a bespoke
  // `openLink` rather than the standard heading resolver.
  {
    id: "venn",
    label: "Venn Diagram",
    template: VENN_TEMPLATE,
    createProcessor: (app) => (parseSource, fullSource, _variant, el, ctx) => {
      const { strippedSource } = extractInlineLinks(parseSource);
      const result = parseVennDiagram(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      renderVennDiagram(result.data, el, {
        source: fullSource,
        app,
        ctx,
        openLink: (target) => { void app.workspace.openLinkText(target, ctx.sourcePath, false); },
      });
    },
  },

  { id: "ost", label: "Opportunity Solution Tree", template: OST_TEMPLATE, createProcessor: linked(parseOST, renderOST) },

  // Carousel resolves image paths to vault resource URLs — its own render shape.
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

  { id: "sipoc",      label: "SIPOC Diagram",          template: SIPOC_TEMPLATE,       createProcessor: linked(parseSIPOC, renderSIPOC) },
  { id: "wardley",    label: "Wardley Map",            template: WARDLEY_TEMPLATE,     createProcessor: linked(parseWardleyMap, renderWardleyMap) },
  { id: "raci",       label: "RACI Matrix",            template: RACI_TEMPLATE,        createProcessor: linked(parseRACIMatrix, renderRACIMatrix) },
  { id: "roadmap",    label: "Now/Next/Later Roadmap", template: ROADMAP_TEMPLATE,     createProcessor: linked(parseRoadmap, renderRoadmap) },
  { id: "pacelayers", label: "Pace Layer Analysis",    template: PACE_LAYERS_TEMPLATE, createProcessor: linked(parsePaceLayers, renderPaceLayers) },

  // Concept/Node maps parse the raw source (bracket syntax the link stripper
  // would mangle) and have no heading-link resolver.
  { id: "conceptmap", label: "Concept Map", template: CONCEPT_MAP_TEMPLATE, createProcessor: plain(parseConceptMap, renderConceptMap) },
  { id: "nodemap",    label: "Node Map",    template: NODE_MAP_TEMPLATE,    createProcessor: plain(parseNodeMap, renderNodeMap) },

  { id: "matrix",  label: "Matrix",              template: MATRIX_IMPACT_TEMPLATE, createProcessor: linked(parseMatrix, renderMatrix) },
  { id: "scqa",    label: "SCQA Narrative",      template: SCQA_TEMPLATE,          createProcessor: linked((src) => parseSCQA(src, "scqa"), renderSCQA) },
  { id: "scr",     label: "SCR Narrative",       template: SCR_TEMPLATE,           createProcessor: linked((src) => parseSCQA(src, "scr"), renderSCQA) },
  { id: "journey", label: "Customer Journey Map", template: JOURNEY_TEMPLATE,      createProcessor: linked(parseJourney, renderJourneyMap) },

  // Wheel of Life parses raw source (its "|"-delimited area lines have no
  // inline-link syntax) and needs no heading-link resolver.
  { id: "wheeloflife", label: "Wheel of Life", template: WHEEL_OF_LIFE_TEMPLATE, createProcessor: plain(parseWheelOfLife, renderWheelOfLife) },

  // Odyssey of Life parses raw source (its "|"-delimited plan/gauge lines have
  // no inline-link syntax) and needs no heading-link resolver.
  { id: "odyssey", label: "Odyssey of Life", template: ODYSSEY_TEMPLATE, createProcessor: plain(parseOdyssey, renderOdyssey) },

  // Covey canvases parse raw source (keyword lines, no inline-link syntax) and
  // need no heading-link resolver.
  { id: "circleofinfluence", label: "Circle of Influence", template: CIRCLE_OF_INFLUENCE_TEMPLATE, createProcessor: plain(parseCircleOfInfluence, renderCircleOfInfluence) },
  { id: "wholeperson", label: "Whole Person", template: WHOLE_PERSON_TEMPLATE, createProcessor: plain(parseWholePerson, renderWholePerson) },

  // Radar parses raw source (its "|"-delimited axis lines have no inline-link
  // syntax) and needs no heading-link resolver.
  { id: "radar", label: "Radar Chart", template: RADAR_TEMPLATE, createProcessor: plain(parseRadar, renderRadar) },

  // Problem statement: a flow of cards (stage keyword sets the eyebrow) linked
  // into a graph. Registered `linked` so a card heading resolves to a same-note
  // chapter (renderHeadingLink). The subtype rides the type variant
  // (`type: problem, engineering`), forwarded to parseProblem.
  { id: "problem", label: "Problem Statement", template: PROBLEM_TEMPLATE, createProcessor: linked(parseProblem, renderProblem) },

  // Test Card parses raw source (top-level `key: value` lines, no inline-link
  // syntax) and needs no heading-link resolver.
  { id: "testcard", label: "Test Card", template: TEST_CARD_TEMPLATE, createProcessor: plain(parseTestCard, renderTestCard) },
];
