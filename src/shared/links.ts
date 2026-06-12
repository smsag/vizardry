import type { App, MarkdownPostProcessorContext } from "obsidian";

/**
 * Resolves a display label to a heading in the same note, combining two
 * sources:
 *   1. Inline annotations — [[#Heading]] written on any keyword line
 *   2. Auto-detection  — headings whose text exactly matches the label
 *
 * Inline annotations take priority over auto-detected matches.
 */
export interface LinkResolver {
  resolve(label: string): string | undefined;
}

/** A no-op resolver used when no app/ctx is available (tests, read-only). */
export const NULL_RESOLVER: LinkResolver = { resolve: () => undefined };

/**
 * Scans source for heading-link annotations on keyword lines and strips them.
 *
 * Two annotation styles are recognised on any line of the form
 * `keyword: Label text <annotation>`:
 *
 *   1. Wiki-link:  [[#Heading text]]
 *   2. Markdown:   [link text](#Anchor%20Text)   — anchor is URL-decoded
 *
 * Returns the source with annotations removed (so existing parsers are
 * unaffected) and a map of lowercased label → heading.
 *
 * Examples:
 *   "block: Value Propositions [[#VP Research]]"
 *   → strippedSource: "block: Value Propositions"
 *   → inlineLinks: { "value propositions": "VP Research" }
 *
 *   "block: Next Experiment [Next Experiment](#Next%20Experiment)"
 *   → strippedSource: "block: Next Experiment"
 *   → inlineLinks: { "next experiment": "Next Experiment" }
 */
export function extractInlineLinks(source: string): {
  strippedSource: string;
  inlineLinks: Record<string, string>;
} {
  const inlineLinks: Record<string, string> = {};

  // 1. Wiki-link style: [[#Heading]]
  // Groups: (indent)(keyword: )(label text) [[#Heading]]
  // Splitting indent and keyword into separate groups lets us rebuild the full
  // line correctly while still deriving the map key from the label alone.
  // [ \t]* (not \s*) before the annotation prevents crossing line boundaries.
  const WIKI_RE = /^([ \t]*)([a-z_-]+:[ \t]*)(.*?)[ \t]*\[\[#([^\]]+)\]\][ \t]*$/gm;
  let strippedSource = source.replace(WIKI_RE, (_m, indent, keyword, label, heading) => {
    const key = label.trim().toLowerCase();
    if (key) inlineLinks[key] = heading.trim();
    return indent + keyword + label.trim();
  });

  // 2. Markdown link style: [text](#Anchor) — anchor is URL-decoded to get heading
  // Same group structure as WIKI_RE.
  const MD_RE = /^([ \t]*)([a-z_-]+:[ \t]*)(.*?)[ \t]*\[[^\]]*\]\(#([^)]+)\)[ \t]*$/gm;
  strippedSource = strippedSource.replace(MD_RE, (_m, indent, keyword, label, anchor) => {
    const key = label.trim().toLowerCase();
    let heading: string;
    try { heading = decodeURIComponent(anchor.trim()); }
    catch { return indent + keyword + label.trim(); }
    if (key) inlineLinks[key] = heading;
    return indent + keyword + label.trim();
  });

  return { strippedSource, inlineLinks };
}

/**
 * Returns all heading texts in the current note using Obsidian's metadata
 * cache — synchronous and fast, no vault read required.
 */
export function getFileHeadings(app: App, ctx: MarkdownPostProcessorContext): string[] {
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) return [];
  const cache = app.metadataCache.getFileCache(file);
  return cache?.headings?.map(h => h.heading) ?? [];
}

/**
 * Creates a LinkResolver that combines inline annotations and auto-detected
 * headings.
 *
 * Resolution order (first match wins):
 *   1. Inline [[#Heading]] annotation on the element line
 *   2. Note heading whose text exactly matches the label (case-insensitive)
 */
export function createLinkResolver(
  inlineLinks: Record<string, string>,
  headings: string[],
): LinkResolver {
  return {
    resolve(label: string): string | undefined {
      const key = label.toLowerCase().trim();
      if (key in inlineLinks) return inlineLinks[key];
      return headings.find(h => h.toLowerCase().trim() === key);
    },
  };
}

/**
 * Convenience: creates a resolver and the navigateTo callback together.
 * Used in every processor that supports linking.
 */
export function buildLinkSupport(
  app: App,
  ctx: MarkdownPostProcessorContext,
  inlineLinks: Record<string, string>,
): {
  resolver: LinkResolver;
  navigateTo: (heading: string) => void;
} {
  const headings = getFileHeadings(app, ctx);
  const resolver = createLinkResolver(inlineLinks, headings);
  const navigateTo = (heading: string): void => {
    void app.workspace.openLinkText(`#${heading}`, ctx.sourcePath, false);
  };
  return { resolver, navigateTo };
}
