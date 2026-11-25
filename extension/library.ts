/**
 * Vizardry as a browser library: one script (`dist/vizardry.js`, global
 * `Vizardry`) and one stylesheet (`dist/vizardry.css`) for any page that
 * wants to draw ```vizardry blocks without Obsidian — another app's web view,
 * a static site. The page owns the element; Vizardry draws into it.
 *
 * ```js
 * const result = Vizardry.render(source, host);   // { error } when it can't
 * await Vizardry.whenSettled(host);
 * const [canvas] = Vizardry.getCanvases(host);
 * const { blob, width, height } = await Vizardry.exportCanvas(canvas, { scale: 3 });
 * ```
 *
 * Read-only, like the browser viewer: there is no vault, so links stay
 * unresolved and nothing is written back. Dark: put `theme-dark` on <html>.
 */
import { app, ctx } from "./obsidian-polyfills";
import { dispatchVizardry } from "../src/vizardry-dispatch";
import { createApi } from "../src/renderer/export-api";
import { ensureSketchDefs } from "../src/shared/sketch-defs";
import { setPluginVersion } from "../src/shared/version";

/** Set by the build from manifest.json. */
declare const __VIZARDRY_VERSION__: string;
setPluginVersion(__VIZARDRY_VERSION__);

const api = createApi();

/** The export API's contract version (see docs/vizardry-export-api.md). */
export const apiVersion = api.version;
/** The Vizardry release this script was built from. */
export const version = __VIZARDRY_VERSION__;

export interface RenderResult {
  /** Why nothing was drawn (no `type:` line, an unknown type, a renderer that threw). */
  error?: string;
}

/**
 * Draws one ```vizardry block's content into `el`, replacing what was there.
 * Synchronous; images and asynchronous parts settle later (`whenSettled`).
 * Never throws for a bad source: the canvas shows the error and the result
 * names it.
 */
export function render(source: string, el: HTMLElement): RenderResult {
  ensureSketchDefs(el.ownerDocument);
  el.empty();
  el.removeClass("vizardry-error");
  dispatchVizardry(source, el, ctx, app);
  if (el.classList.contains("vizardry-error")) {
    const message = el.querySelector(".vizardry-error-message")?.textContent ?? "";
    return { error: message || "The canvas could not be drawn." };
  }
  return {};
}

export const getCanvases = api.getCanvases;
export const whenSettled = api.whenSettled;
export const exportCanvas = api.exportCanvas;
