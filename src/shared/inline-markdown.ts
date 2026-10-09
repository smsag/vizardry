/**
 * Inline markdown for canvas labels: **bold**, *italic*, _italic_,
 * ~~strikethrough~~ and Obsidian's ==highlight==, including the six coloured
 * highlights Obsidian 1.13 added (==🔴text==, ==🟠…==, ==🟡…==, ==🟢…==,
 * ==🔵…==, ==🟣…==). Formats nest (`**==x==**`, `==a *b* c==`), and a
 * backslash escapes a marker character (`\==` stays literal).
 *
 * Everything else is plain text. Output is built with createEl/appendText
 * only, never innerHTML, so label text can't inject markup.
 */

export type HighlightColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em" | "s"; children: InlineNode[] }
  | { kind: "mark"; color: HighlightColor | null; children: InlineNode[] };

type Delim = "==" | "**" | "~~" | "*" | "_";

// Longer delimiters first, so ** is never read as two *.
const DELIMS: readonly Delim[] = ["==", "**", "~~", "*", "_"];

const ESCAPABLE = new Set(["\\", "*", "_", "~", "="]);

// The emoji Obsidian reads as a highlight colour when it directly follows the
// opening ==. It is consumed, not shown.
const HIGHLIGHT_EMOJI: ReadonlyMap<number, HighlightColor> = new Map([
  [0x1f534, "red"],
  [0x1f7e0, "orange"],
  [0x1f7e1, "yellow"],
  [0x1f7e2, "green"],
  [0x1f535, "blue"],
  [0x1f7e3, "purple"],
]);
const VARIATION_SELECTOR = 0xfe0f;

/** Labels beyond this length render as plain text: a guard against
 *  pathological marker soup, far above any real canvas label. */
const MAX_PARSE_LENGTH = 5000;

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Can `d` open at `i`? The next character must not be whitespace, and an
 *  underscore must not sit inside a word (`snake_case` stays literal). */
function canOpen(text: string, i: number, d: Delim): boolean {
  if (isSpace(text[i + d.length])) return false;
  if (d === "_" && isWordChar(text[i - 1])) return false;
  // A single * or _ directly before the same character is part of a longer run.
  if (d.length === 1 && text[i + 1] === d) return false;
  return true;
}

/** Can `d` close at `i`? The previous character must not be whitespace. */
function canClose(text: string, i: number, d: Delim): boolean {
  if (isSpace(text[i - 1])) return false;
  if (d === "_" && isWordChar(text[i + 1])) return false;
  return true;
}

interface ParseResult {
  nodes: InlineNode[];
  /** Index just past the closing delimiter, or -1 if none was found. */
  end: number;
}

class Parser {
  // Failed attempts, keyed by position + delimiter + enclosing stack, so a
  // run of unmatched openers is scanned once each, not once per enclosing try.
  private failed = new Set<string>();

  constructor(private readonly text: string) {}

  /** Parse from `start` until `closer` (or the end when `closer` is null).
   *  `stack` holds the enclosing closers: meeting one of them aborts this
   *  level, so `==a **b== c**` highlights `a **b` instead of crossing over. */
  parse(start: number, closer: Delim | null, stack: readonly Delim[]): ParseResult {
    const { text } = this;
    const nodes: InlineNode[] = [];
    let buf = "";
    const flush = (): void => {
      if (buf) { nodes.push({ kind: "text", text: buf }); buf = ""; }
    };

    let i = start;
    while (i < text.length) {
      const ch = text[i]!;

      if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) {
        buf += text[i + 1];
        i += 2;
        continue;
      }

      const d = DELIMS.find((x) => text.startsWith(x, i));
      if (d === undefined) { buf += ch; i++; continue; }

      if (d === closer && canClose(text, i, d) && (nodes.length > 0 || buf.length > 0)) {
        flush();
        return { nodes, end: i + d.length };
      }
      if (stack.includes(d) && canClose(text, i, d)) {
        // An enclosing format closes here first: this level can't complete.
        return { nodes: [], end: -1 };
      }

      if (canOpen(text, i, d)) {
        const node = this.tryFormat(i, d, closer === null ? stack : [...stack, closer]);
        if (node) {
          flush();
          nodes.push(node.node);
          i = node.end;
          continue;
        }
      }

      buf += d;
      i += d.length;
    }

    flush();
    return closer === null ? { nodes, end: text.length } : { nodes: [], end: -1 };
  }

  private tryFormat(i: number, d: Delim, stack: readonly Delim[]): { node: InlineNode; end: number } | null {
    const key = `${i}:${d}:${stack.join(",")}`;
    if (this.failed.has(key)) return null;

    let contentStart = i + d.length;
    let color: HighlightColor | null = null;
    if (d === "==") {
      const cp = this.text.codePointAt(contentStart);
      const c = cp === undefined ? undefined : HIGHLIGHT_EMOJI.get(cp);
      if (c) {
        color = c;
        contentStart += 2; // the emoji is one surrogate pair
        if (this.text.codePointAt(contentStart) === VARIATION_SELECTOR) contentStart += 1;
      }
    }

    const inner = this.parse(contentStart, d, stack);
    if (inner.end < 0) {
      this.failed.add(key);
      return null;
    }
    const node: InlineNode =
      d === "==" ? { kind: "mark", color, children: inner.nodes }
      : d === "**" ? { kind: "strong", children: inner.nodes }
      : d === "~~" ? { kind: "s", children: inner.nodes }
      : { kind: "em", children: inner.nodes };
    return { node, end: inner.end };
  }
}

/** Parses `text` into inline nodes. Unmatched markers stay as text. */
export function parseInline(text: string): InlineNode[] {
  if (!text) return [];
  if (text.length > MAX_PARSE_LENGTH) return [{ kind: "text", text }];
  return new Parser(text).parse(0, null, []).nodes;
}

function nodesToText(nodes: readonly InlineNode[]): string {
  let out = "";
  for (const n of nodes) out += n.kind === "text" ? n.text : nodesToText(n.children);
  return out;
}

/**
 * The text a reader sees, without markers: for measuring and wrapping,
 * matching labels against headings, aria-labels and anything else that
 * needs the plain words.
 */
export function stripInline(text: string): string {
  return nodesToText(parseInline(text));
}

/** True when `text` contains any formatting that renders differently from
 *  its source. Lets plain labels skip the DOM work. */
export function hasInlineMarkup(text: string): boolean {
  return /[*_~=\\]/.test(text);
}

function renderNodes(el: HTMLElement, nodes: readonly InlineNode[]): void {
  for (const n of nodes) {
    if (n.kind === "text") {
      el.appendText(n.text);
    } else if (n.kind === "mark") {
      const mark = el.createEl("mark", { cls: "vzd-mark" });
      // Same shape as Obsidian's Reading view, so a theme's
      // mark[data-highlight="red"] rules style canvas highlights too.
      if (n.color) mark.dataset.highlight = n.color;
      renderNodes(mark, n.children);
    } else {
      renderNodes(el.createEl(n.kind), n.children);
    }
  }
}

/** Renders `text` as inline markdown into `el` (appending; empty `el` first
 *  to replace). */
export function renderInline(el: HTMLElement, text: string): void {
  if (!hasInlineMarkup(text)) {
    if (text) el.appendText(text);
    return;
  }
  renderNodes(el, parseInline(text));
}

/** Replaces `el`'s content with `text` rendered as inline markdown. */
export function setInline<T extends HTMLElement>(el: T, text: string): T {
  el.textContent = "";
  renderInline(el, text);
  return el;
}

/** `parent.createEl(tag, { cls })` holding `text` as inline markdown: the
 *  formatted counterpart of `createEl(tag, { cls, text })` for label text. */
export function createInlineEl<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  cls: string | undefined,
  text: string,
): HTMLElementTagNameMap[K] {
  const el = parent.createEl(tag, cls ? { cls } : {});
  renderInline(el, text);
  return el;
}
