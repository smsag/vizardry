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
 * Scans source for [[#Heading]] annotations on keyword lines and strips them.
 *
 * Handles any line of the form:
 *   keyword: Label text [[#Heading text]]
 *
 * Returns the source with annotations removed (so existing parsers are
 * unaffected) and a map of lowercased label → heading.
 *
 * Example:
 *   "block: Value Propositions [[#VP Research]]"
 *   → strippedSource: "block: Value Propositions"
 *   → inlineLinks: { "value propositions": "VP Research" }
 */
export function extractInlineLinks(source: string): {
  strippedSource: string;
  inlineLinks: Record<string, string>;
} {
  const inlineLinks: Record<string, string> = {};
  const INLINE_RE = /^([a-z_-]+:\s*)(.*?)\s*\[\[#([^\]]+)\]\]\s*$/gm;

  const strippedSource = source.replace(INLINE_RE, (_m, prefix, label, heading) => {
    const key = label.trim().toLowerCase();
    if (key) inlineLinks[key] = heading.trim();
    return prefix + label.trim();
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
 * Creates a LinkResolver that combines:
 *   - baseLinks: from _links: section (backward compat) or similar
 *   - inlineLinks: from [[#Heading]] inline annotations (higher priority)
 *   - headings: all headings in the note for exact-name auto-detection
 *
 * Resolution order (first match wins):
 *   1. Inline [[#Heading]] annotation
 *   2. _links: section entry
 *   3. Note heading whose text exactly matches the label (case-insensitive)
 */
export function createLinkResolver(
  inlineLinks: Record<string, string>,
  baseLinks: Record<string, string>,
  headings: string[],
): LinkResolver {
  return {
    resolve(label: string): string | undefined {
      const key = label.toLowerCase().trim();
      if (key in inlineLinks) return inlineLinks[key];
      if (key in baseLinks) return baseLinks[key];
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
  baseLinks: Record<string, string> = {},
): {
  resolver: LinkResolver;
  navigateTo: (heading: string) => void;
} {
  const headings = getFileHeadings(app, ctx);
  const resolver = createLinkResolver(inlineLinks, baseLinks, headings);
  const navigateTo = (heading: string): void => {
    void app.workspace.openLinkText(`#${heading}`, ctx.sourcePath, false);
  };
  return { resolver, navigateTo };
}
