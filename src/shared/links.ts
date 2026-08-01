import type { App, MarkdownPostProcessorContext } from "obsidian";
import { LINEAR_KEY_RE } from "./linear-enrichment";
import { buildKeyRegex } from "./upvoty-enrichment";
import { getUpvotyService } from "../upvoty";

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
  /** Explicit `[label](CORE-1234)`-style ticket annotation — no auto-detect
   *  fallback (that's what the separate blind text-scan enrichment is for). */
  resolveTicket?(label: string): TicketMatch | undefined;
}

/** An explicit per-item Linear/Upvoty ticket annotation. */
export interface TicketMatch {
  service: "linear" | "upvoty";
  key: string;
}

/** A no-op resolver used when no app/ctx is available (tests, read-only). */
export const NULL_RESOLVER: LinkResolver = { resolve: () => undefined };

/**
 * Classifies a markdown-link target (the text inside the parens, already
 * trimmed, guaranteed not to start with "#") as a Linear or Upvoty ticket
 * key, or returns null if it matches neither shape. Requires the ENTIRE
 * target to be the key — not just a substring — so an ordinary external
 * link or relative note path is never mistaken for one (e.g. "docs.md" or
 * "CORE-1234-notes.md" don't match, only an exact "CORE-1234" does).
 *
 * Checked in a fixed order (Linear, then Upvoty); the two shapes could in
 * principle collide for an all-digit Upvoty base62 id, an accepted
 * ambiguity rather than something worth a more elaborate disambiguation.
 */
export function classifyTicketTarget(target: string): TicketMatch | null {
  LINEAR_KEY_RE.lastIndex = 0;
  const linearMatch = LINEAR_KEY_RE.exec(target);
  if (linearMatch && linearMatch[0] === target) {
    return { service: "linear", key: target };
  }

  const prefix = getUpvotyService()?.getKeyPrefix();
  if (prefix) {
    const upvotyRe = buildKeyRegex(prefix);
    upvotyRe.lastIndex = 0;
    const upvotyMatch = upvotyRe.exec(target);
    if (upvotyMatch && upvotyMatch[0] === target) {
      return { service: "upvoty", key: target };
    }
  }

  return null;
}

/**
 * Scans source for heading-link and ticket annotations on keyword lines and
 * strips them.
 *
 * Two annotation styles are recognised on any line of the form
 * `keyword: Label text <annotation>`:
 *
 *   1. Wiki-link:  [[#Heading text]]
 *   2. Markdown:   [link text](target)
 *
 * For the markdown-link style, `target` is classified by shape:
 *   - starts with "#"          → heading anchor (URL-decoded)
 *   - matches a ticket key shape (Linear/Upvoty) → ticket annotation
 *   - anything else            → left completely untouched, e.g. an
 *     ordinary external link `[Docs](https://example.com)` is never
 *     stripped or otherwise modified — it just renders normally.
 *
 * Returns the source with recognised annotations removed (so existing
 * parsers are unaffected) plus a map of lowercased label → heading and a
 * separate map of lowercased label → ticket match.
 *
 * Examples:
 *   "block: Value Propositions [[#VP Research]]"
 *   → strippedSource: "block: Value Propositions"
 *   → inlineLinks: { "value propositions": "VP Research" }
 *
 *   "block: Next Experiment [Next Experiment](#Next%20Experiment)"
 *   → strippedSource: "block: Next Experiment"
 *   → inlineLinks: { "next experiment": "Next Experiment" }
 *
 *   "block: Fix login bug [Fix login bug](CORE-1234)"
 *   → strippedSource: "block: Fix login bug"
 *   → inlineTicketLinks: { "fix login bug": { service: "linear", key: "CORE-1234" } }
 */
export function extractInlineLinks(source: string): {
  strippedSource: string;
  inlineLinks: Record<string, string>;
  inlineTicketLinks: Record<string, TicketMatch>;
} {
  const inlineLinks: Record<string, string> = {};
  const inlineTicketLinks: Record<string, TicketMatch> = {};

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

  // 2. Markdown link style: [text](target) — target is classified by shape
  // (heading anchor, ticket key, or left untouched). Same group structure as
  // WIKI_RE.
  const MD_RE = /^([ \t]*)([a-z_-]+:[ \t]*)(.*?)[ \t]*\[[^\]]*\]\(([^)]+)\)[ \t]*$/gm;
  strippedSource = strippedSource.replace(MD_RE, (m, indent, keyword, label, rawTarget) => {
    const key = label.trim().toLowerCase();
    const target = rawTarget.trim();

    if (target.startsWith("#")) {
      let heading: string;
      try { heading = decodeURIComponent(target.slice(1)); }
      catch { return indent + keyword + label.trim(); }
      if (key) inlineLinks[key] = heading;
      return indent + keyword + label.trim();
    }

    const ticket = classifyTicketTarget(target);
    if (ticket) {
      if (key) inlineTicketLinks[key] = ticket;
      return indent + keyword + label.trim();
    }

    return m; // not a recognised target shape — leave the line untouched
  });

  // 3 & 4. Same two styles for lines WITHOUT a keyword prefix (e.g. OST/Mind Map child nodes).
  // Only processes when there is label text before the annotation — a bare link like
  // `  [text](#anchor)` with no preceding label is left untouched (key would be empty).
  const WIKI_RE_NK = /^([ \t]*)(.*?)[ \t]*\[\[#([^\]]+)\]\][ \t]*$/gm;
  strippedSource = strippedSource.replace(WIKI_RE_NK, (m, indent, label, heading) => {
    const key = label.trim().toLowerCase();
    if (!key) return m;
    inlineLinks[key] = heading.trim();
    return indent + label.trim();
  });

  const MD_RE_NK = /^([ \t]*)(.*?)[ \t]*\[[^\]]*\]\(([^)]+)\)[ \t]*$/gm;
  strippedSource = strippedSource.replace(MD_RE_NK, (m, indent, label, rawTarget) => {
    const key = label.trim().toLowerCase();
    if (!key) return m;
    const target = rawTarget.trim();

    if (target.startsWith("#")) {
      let heading: string;
      try { heading = decodeURIComponent(target.slice(1)); }
      catch { return m; }
      inlineLinks[key] = heading;
      return indent + label.trim();
    }

    const ticket = classifyTicketTarget(target);
    if (ticket) {
      inlineTicketLinks[key] = ticket;
      return indent + label.trim();
    }

    return m;
  });

  return { strippedSource, inlineLinks, inlineTicketLinks };
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
 *
 * `resolveTicket` is explicit-annotation-only — deliberately no auto-detect
 * fallback, since that's already covered by the separate blind text-scan
 * enrichment (enrichLinearKeys/enrichUpvotyKeys).
 */
export function createLinkResolver(
  inlineLinks: Record<string, string>,
  headings: string[],
  inlineTicketLinks: Record<string, TicketMatch> = {},
): LinkResolver {
  return {
    resolve(label: string): string | undefined {
      const key = label.toLowerCase().trim();
      if (key in inlineLinks) return inlineLinks[key];
      return headings.find(h => h.toLowerCase().trim() === key);
    },
    resolveTicket(label: string): TicketMatch | undefined {
      return inlineTicketLinks[label.toLowerCase().trim()];
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
  inlineTicketLinks?: Record<string, TicketMatch>,
): {
  resolver: LinkResolver;
  navigateTo: (heading: string) => void;
} {
  const headings = getFileHeadings(app, ctx);
  const resolver = createLinkResolver(inlineLinks, headings, inlineTicketLinks);
  const navigateTo = (heading: string): void => {
    void app.workspace.openLinkText(`#${heading}`, ctx.sourcePath, false);
  };
  return { resolver, navigateTo };
}
