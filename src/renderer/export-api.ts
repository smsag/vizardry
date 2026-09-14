/**
 * Vizardry's public API for other plugins.
 *
 * The motivating caller is a plugin that typesets a note as a PDF: its
 * typesetter cannot draw a Vizardry canvas, so the canvas is captured as a PNG
 * inside Obsidian and handed over. Everything here is a thin, documented layer
 * over the same capture the download button uses — see `captureCanvas` in
 * ./controls — so the two can never drift.
 *
 * Reached from another plugin as:
 *
 *     const api = (app.plugins.plugins.vizardry as { api?: VizardryApi })?.api;
 *     if (api && api.version >= 1) { ... }
 *
 * A missing API means "capture it yourself"; that fallback must keep working, so
 * nothing here throws at load time.
 *
 * The contract is additive within `version: 1`. Members are added, never
 * removed or narrowed; a breaking change bumps `version` and says so in the
 * release notes.
 */

import {
  captureCanvas,
  DEFAULT_MAX_EDGE,
  MIN_CAPTURE_SCALE,
  type CaptureOptions,
} from "./controls";
import { VizardryExportError } from "../shared/export-error";
import { whenSettled } from "../shared/settle";

/**
 * Put this class on the element a note is rendered into — *before* rendering —
 * to suppress Linear / Upvoty key enrichment for everything inside it: no
 * badges, no popovers, no AI summaries, and no network calls. Enrichment runs
 * during the markdown render (see the post-processors in src/main.ts), so no
 * export option can undo it afterwards; the class has to be in place first.
 *
 * Published to callers as `api.noEnrichClass` because there is no import path
 * between two Obsidian plugins — a plugin can read properties off the instance
 * we expose, not our module exports.
 */
export const VIZARDRY_NO_ENRICH_CLASS = "vizardry-no-enrich";

/** The class `initCanvas` puts on every canvas root. */
const CANVAS_CLASS = "vizardry-canvas";

export interface VizardryExportOptions {
  /** "png" today; another format would arrive as a new accepted value. */
  format?: "png";
  /** Device pixels per CSS pixel. Default 2, clamped to [0.25, 4]. */
  scale?: number;
  /**
   * Ceiling on the longer edge of the result, in pixels. Default 8000. The
   * scale is reduced to fit; only if even the lowest scale would exceed it does
   * the export reject with `too-large`.
   */
  maxEdge?: number;
  /**
   * Capture as if the light theme were active, whatever the vault uses.
   * Default true — a canvas is nearly always going onto white paper.
   */
  light?: boolean;
  /** Colour painted behind the canvas. Default "#ffffff". */
  background?: string;
  /**
   * Keep the canvas's own title row. Default true, which is what the download
   * button produces. Pass false when the surrounding document supplies its own
   * caption, or the title appears twice.
   */
  header?: boolean;
}

export interface VizardryExportResult {
  blob: Blob;
  /** Actual pixel dimensions of the image. */
  width: number;
  height: number;
  /** The scale actually used; below the requested one when `maxEdge` bit. */
  scale: number;
  format: "png";
  /** The canvas's displayed title, as a caption fallback. Empty when it has none. */
  title: string;
}

export interface VizardryApi {
  /** Bumped only for a breaking change. Callers check `version >= 1`. */
  readonly version: 1;
  /** The class that suppresses key enrichment on a render host. */
  readonly noEnrichClass: string;
  /**
   * Every Vizardry canvas inside `root`, in document order — including the ones
   * a `collapsed: true` line minimized, which export in full. `root` itself is
   * included when it is a canvas.
   */
  getCanvases(root: HTMLElement): HTMLElement[];
  /**
   * Resolve once rendering inside `el` has settled: layout frames, then images,
   * then DOM quiescence (for asynchronous diagram swaps), bounded by `maxMs`.
   * Keep your own deadline on top of it.
   */
  whenSettled(el: HTMLElement, options?: { quietMs?: number; maxMs?: number }): Promise<void>;
  /**
   * Capture one rendered canvas.
   *
   * `el` must be connected to the document and laid out with a non-zero width —
   * an offscreen host is fine, `display: none` and detached nodes are not.
   * Vizardry mounts nothing itself; the caller owns its render host.
   *
   * Guarantees: buttons and controls are never captured; the canvas title row is
   * captured unless `header: false`; a collapsed canvas is un-collapsed for the
   * capture; the live canvas is restored exactly, whatever happens. Concurrent
   * calls are serialised internally.
   *
   * Rejects with a {@link VizardryExportError} carrying `code`.
   */
  exportCanvas(el: HTMLElement, options?: VizardryExportOptions): Promise<VizardryExportResult>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A finite positive number, or the default. Guards against NaN and junk. */
function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveExportOptions(options?: VizardryExportOptions): CaptureOptions {
  return {
    scale: clamp(positive(options?.scale, 2), MIN_CAPTURE_SCALE, 4),
    maxEdge: positive(options?.maxEdge, DEFAULT_MAX_EDGE),
    light: options?.light ?? true,
    background: typeof options?.background === "string" && options.background.trim()
      ? options.background
      : "#ffffff",
    header: options?.header ?? true,
  };
}

export function getCanvases(root: HTMLElement): HTMLElement[] {
  const found = root.classList.contains(CANVAS_CLASS) ? [root] : [];
  return found.concat(Array.from(root.querySelectorAll<HTMLElement>(`.${CANVAS_CLASS}`)));
}

export async function exportCanvas(
  el: HTMLElement,
  options?: VizardryExportOptions,
): Promise<VizardryExportResult> {
  // Duck-typed rather than `instanceof HTMLElement`: a canvas in a pop-out
  // Obsidian window belongs to that window's realm, where the main window's
  // HTMLElement is a different constructor and the check would wrongly fail.
  if (typeof el?.classList?.contains !== "function" || !el.classList.contains(CANVAS_CLASS)) {
    throw new VizardryExportError(
      "not-a-canvas",
      "That element is not a Vizardry canvas root. Use getCanvases() to find the canvases inside a rendered note.",
    );
  }
  if (options?.format !== undefined && options.format !== "png") {
    throw new VizardryExportError(
      "capture-failed",
      `Unsupported export format "${String(options.format)}". Only "png" is supported.`,
    );
  }
  const outcome = await captureCanvas(el, resolveExportOptions(options));
  return {
    ...outcome,
    format: "png",
    // The title as displayed. `data-canvas-title` is deliberately not used: it
    // is lower-cased for link matching, which would read oddly as a caption.
    title: el.querySelector<HTMLElement>(".vizardry-title")?.textContent?.trim() ?? "",
  };
}

/** Build the object hung on the plugin instance as `.api`. */
export function createApi(): VizardryApi {
  return Object.freeze({
    version: 1,
    noEnrichClass: VIZARDRY_NO_ENRICH_CLASS,
    getCanvases,
    whenSettled,
    exportCanvas,
  }) as VizardryApi;
}
