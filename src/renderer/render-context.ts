import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { LinkResolver } from "../shared/links";

/**
 * Uniform trailing argument for every bespoke (non-grid) renderer.
 *
 * These renderers used to each take the same optional editor/link plumbing as
 * a *positional* tail — but in a different order per renderer (some
 * `(…, resolver, navigateTo, source, app, ctx)`, others
 * `(…, source, app, ctx, resolver, navigateTo)`, others `(…, app, ctx, source)`).
 * Bundling it into one object means every renderer is now called the same way,
 * `renderX(data, container, rc)`, and adding a field later doesn't ripple
 * through argument lists. See src/processors.ts for the single call site.
 */
export interface RenderContext {
  /** Pristine block source — used for title parsing, the `vzSource` write-back
   *  fingerprint, and copy-to-clipboard reconstruction. */
  source?: string;
  app?: App;
  ctx?: MarkdownPostProcessorContext;
  /** Heading-link resolver. Renderers that had a `NULL_RESOLVER` default keep
   *  it via `rc.resolver ?? NULL_RESOLVER`. */
  resolver?: LinkResolver;
  /** Navigate to a heading in the current note. */
  navigateTo?: (heading: string) => void;
  /** Venn-only: open an arbitrary link target (not necessarily a heading). */
  openLink?: (target: string) => void;
}
