/**
 * Single entry point for the unified ```vizardry code-block language.
 *
 * Every canvas used to be its own Obsidian code-block language (```bmc,
 * ```swot, ```matrix, ...). Now there is exactly one — ```vizardry — and a
 * top-level `type:` line inside the block says which canvas to render, e.g.
 * `type: bmc`, or `type: matrix, pain` for a framework that also has its own
 * internal variant (comma-separated: `<id>[, <variant>]`).
 *
 * Two different "source" strings flow through this module for two different
 * reasons: `parseSource` has the `type:` line blanked out (never removed —
 * removing it would shift every subsequent line number, breaking parser
 * error messages) so each framework's own parser never sees a line it
 * doesn't understand; `fullSource` is the pristine, untouched block content,
 * which every renderer needs for `initCanvas`'s title-parsing, its
 * `dataset.vzSource` write-back fingerprint (used by `resolveEditor`'s
 * Live Preview content-scan fallback), and copy-to-clipboard reconstruction.
 * Feeding the blanked copy to the renderer would corrupt all three.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { extractInlineLinks, buildLinkSupport, getFileHeadings, createLinkResolver } from "./shared/links";
import { parseFrameworkSource } from "./parser";
import { renderCanvas, renderError } from "./renderer";
import { renderCanvasWarnings } from "./renderer/controls";
import { registerCanvasRelink, relinkCanvas } from "./renderer/canvas";
import { FRAMEWORKS } from "./frameworks-registry";
import { CUSTOM_RENDERERS } from "./processors";
import type { CustomRenderer } from "./processors";
import { getPluginVersion } from "./shared/version";
import { renderMultiCanvas } from "./renderer/multi-canvas";
import { renderReadOnly } from "./shared/editor";

const CUSTOM_RENDERER_MAP: Record<string, CustomRenderer> = Object.fromEntries(
  CUSTOM_RENDERERS.map(r => [r.id, r]),
);

type ExtractedType = {
  id: string;
  variant: string | undefined;
  parseSource: string;
};

/**
 * Finds the first top-level `type:` line (mirroring the indent guard used
 * elsewhere for config lines), splits its value on the first comma into an
 * id and an optional variant, and returns a copy of `source` with that line
 * blanked out. Returns null if no top-level `type:` line exists.
 *
 * A duplicate top-level `type:` line is not an error — the first one wins —
 * but it's also blanked out here so it never reaches a framework's own
 * parser, which doesn't recognise "type:" syntax and would otherwise reject
 * it with a confusing "unexpected syntax" error that doesn't explain the
 * real cause (a duplicate type: declaration).
 */
export function extractType(source: string): ExtractedType | null {
  const lines = source.split("\n");
  let result: ExtractedType | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.search(/\S/) !== 0) continue; // only top-level lines
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith("type:")) continue;

    if (!result) {
      const value = trimmed.slice("type:".length).trim();
      const commaIdx = value.indexOf(",");
      const id = (commaIdx !== -1 ? value.slice(0, commaIdx) : value).trim().toLowerCase();
      const variant = commaIdx !== -1 ? value.slice(commaIdx + 1).trim().toLowerCase() : undefined;
      result = { id, variant, parseSource: "" }; // parseSource filled in below
    }
    lines[i] = "";
  }

  if (!result) return null;
  return { ...result, parseSource: lines.join("\n") };
}

/**
 * Blanks (never removes — line numbers must stay put for parser error
 * messages) any top-level `sticky:` config line, mirroring how `extractType`
 * blanks the `type:` line. The flag is a presentation concern read from the
 * full source in `initCanvas` (like `collapsed:`); blanking it centrally here
 * means no framework parser needs to learn to skip it.
 */
export function blankStickyLines(source: string): string {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].search(/\S/) !== 0) continue; // top-level lines only
    if (lines[i].trim().toLowerCase().startsWith("sticky:")) lines[i] = "";
  }
  return lines.join("\n");
}

/**
 * Splits a fence body into one source string per canvas. Each top-level
 * `type:` line begins a new canvas; any preamble before the first `type:`
 * (blank lines, a stray comment) attaches to the first canvas. A block with a
 * single `type:` line returns `[source]` unchanged, so single-canvas rendering
 * is byte-for-byte what it was before this feature existed.
 *
 * Each returned segment therefore contains exactly one top-level `type:` line,
 * so feeding a segment straight through `extractType` + the single-canvas
 * render path Just Works.
 */
export function splitVizardryCanvases(source: string): string[] {
  const lines = source.split("\n");
  const typeLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].search(/\S/) !== 0) continue; // top-level lines only
    if (lines[i].trim().toLowerCase().startsWith("type:")) typeLines.push(i);
  }
  if (typeLines.length <= 1) return [source];

  // Boundaries: the first canvas owns everything from line 0 (preamble
  // included); every later canvas starts at its own `type:` line.
  const starts = [0, ...typeLines.slice(1)];
  return starts.map((from, s) => {
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    return lines.slice(from, to).join("\n");
  });
}

export function dispatchVizardry(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  app: App,
): void {
  const segments = splitVizardryCanvases(source);
  if (segments.length <= 1) {
    renderSingleCanvas(source, el, ctx, app);
    return;
  }
  // Several canvases share one code fence. Per-canvas write-back can't target
  // the right source lines through one shared section range, so the whole
  // carousel renders read-only in this first release (edit each as text).
  renderMultiCanvas(segments, el, (segment, panelEl) =>
    renderReadOnly(() => renderSingleCanvas(segment, panelEl, ctx, app)),
  );
}

function renderSingleCanvas(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  app: App,
): void {
  const found = extractType(source);
  if (!found) {
    renderError('Missing required "type:" line — e.g. "type: bmc"', el);
    return;
  }
  const { id, variant } = found;
  // Strip the presentation-only `sticky:` line before any parser sees it; the
  // flag itself is read from the full source in initCanvas.
  const parseSource = blankStickyLines(found.parseSource);

  const definition = FRAMEWORKS[id];
  const custom = CUSTOM_RENDERER_MAP[id];
  if (!definition && !custom) {
    renderError(`Unknown type "${id}"`, el);
    return;
  }

  try {
    if (definition) {
      const { strippedSource, inlineLinks, inlineTicketLinks, inlineCanvasLinks } = extractInlineLinks(parseSource);
      const result = parseFrameworkSource(strippedSource);
      if (!result.ok) { renderError(result.error, el); return; }
      const { resolver, navigateTo } = buildLinkSupport(app, ctx, inlineLinks, inlineTicketLinks, inlineCanvasLinks);
      renderCanvas(definition, result.data, result.cardBlocks, el, resolver, navigateTo, app, ctx, source, result.allCards);
      renderCanvasWarnings(el, result.warnings);
      // Re-evaluate link buttons whenever the note's headings change (e.g. a
      // matching heading is added outside the code block after first render).
      registerCanvasRelink(ctx.sourcePath, () => {
        const freshResolver = createLinkResolver(inlineLinks, getFileHeadings(app, ctx), inlineTicketLinks, inlineCanvasLinks);
        relinkCanvas(el, definition, freshResolver, navigateTo, app, ctx);
      }, el);
    } else if (custom) {
      custom.createProcessor(app)(parseSource, source, variant, el, ctx);
    }
  } catch (err) {
    console.error(`Vizardry v${getPluginVersion()}: renderer "${id}" threw`, err);
    renderError(`Renderer error — check the console (Vizardry v${getPluginVersion()})`, el);
  }
}
