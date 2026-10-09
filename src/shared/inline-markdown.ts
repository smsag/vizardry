/**
 * Inline markdown for canvas labels: **bold** / __bold__, *italic* /
 * _italic_, ~~strikethrough~~ and Obsidian's ==highlight==, including the six
 * coloured highlights Obsidian 1.13 added (==🔴text==, ==🟠…==, ==🟡…==,
 * ==🟢…==, ==🔵…==, ==🟣…==). Formats nest (`**==x==**`, `***both***`), and a
 * backslash escapes a marker character (`\==` stays literal).
 *
 * The parser is CommonMark's delimiter-run algorithm ("process emphasis"):
 * one tokenizing pass, then each closer is matched against the nearest
 * compatible opener, with a per-kind lower bound so a failed search is never
 * repeated. Linear in practice, however unbalanced the markers.
 *
 * Everything else is plain text. Output is built with createEl/appendText
 * only, never innerHTML, so label text can't inject markup.
 */

export type HighlightColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em" | "s"; children: InlineNode[] }
  | { kind: "mark"; color: HighlightColor | null; children: InlineNode[] };

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
const VARIATION_SELECTOR = "\uFE0F";

/** Labels beyond this length render as plain text, far above any real label. */
const MAX_PARSE_LENGTH = 5000;

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/u.test(ch);
const isPunct = (ch: string | undefined): boolean => ch !== undefined && /\p{P}/u.test(ch);

// ── Tokens: a doubly linked list of text and delimiter runs ─────────────────

type Elem = { kind: "strong" | "em" | "s" | "mark"; color: HighlightColor | null; head: Tok | null };
type Tok =
  | { t: "text"; text: string; prev: Tok | null; next: Tok | null }
  | { t: "elem"; elem: Elem; prev: Tok | null; next: Tok | null }
  | { t: "delim"; ch: string; count: number; canOpen: boolean; canClose: boolean; prev: Tok | null; next: Tok | null };
type DelimTok = Extract<Tok, { t: "delim" }>;

/** Delimiter characters and whether a run must be exactly two long
 *  (== and ~~), or may be any length (* and _: one = em, two = strong). */
const DELIM_CHARS: Record<string, { exact2: boolean }> = {
  "*": { exact2: false }, "_": { exact2: false }, "~": { exact2: true }, "=": { exact2: true },
};

/** Returns an empty sentinel token heading the list: an opener at the very
 *  start can be unlinked without losing the head. */
function tokenize(text: string): { head: Tok; delims: DelimTok[] } {
  const head: Tok = { t: "text", text: "", prev: null, next: null };
  let tail: Tok = head;
  const delims: DelimTok[] = [];
  const push = (tok: Tok): void => {
    tok.prev = tail;
    tail.next = tok;
    tail = tok;
  };
  let buf = "";
  const flush = (): void => {
    if (buf) { push({ t: "text", text: buf, prev: null, next: null }); buf = ""; }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) { buf += text[i + 1]; i += 2; continue; }
    const spec = DELIM_CHARS[ch];
    if (!spec) { buf += ch; i++; continue; }

    let j = i;
    while (text[j] === ch) j++;
    const count = j - i;
    if (spec.exact2 && count !== 2) { buf += text.slice(i, j); i = j; continue; }

    // CommonMark flanking rules, from the characters around the whole run.
    const before = text[i - 1];
    const after = text[j];
    const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
    const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
    // An underscore never opens or closes inside a word (`snake_case`).
    const canOpen = ch === "_" ? left && (!right || isPunct(before)) : left;
    const canClose = ch === "_" ? right && (!left || isPunct(after)) : right;

    flush();
    if (!canOpen && !canClose) { push({ t: "text", text: text.slice(i, j), prev: null, next: null }); i = j; continue; }
    const tok: DelimTok = { t: "delim", ch, count, canOpen, canClose, prev: null, next: null };
    push(tok);
    delims.push(tok);
    i = j;
  }
  flush();
  return { head, delims };
}

/** Removes `tok` from the token list. */
function unlink(tok: Tok): void {
  if (tok.prev) tok.prev.next = tok.next;
  if (tok.next) tok.next.prev = tok.prev;
  tok.prev = tok.next = null;
}

/** For ==: reads a colour emoji at the start of the content and consumes it.
 *  Returns undefined when nothing but the emoji is inside (`==🔴==` stays
 *  literal, like `====`). */
function takeColor(first: Tok | null, last: Tok): HighlightColor | null | undefined {
  if (!first || first.t !== "text") return null;
  const cp = first.text.codePointAt(0);
  const color = cp === undefined ? undefined : HIGHLIGHT_EMOJI.get(cp);
  if (!color) return null;
  let rest = first.text.slice(2);
  if (rest.startsWith(VARIATION_SELECTOR)) rest = rest.slice(1);
  if (!rest && first === last) return undefined;
  first.text = rest;
  return color;
}

/** CommonMark "process emphasis" over the delimiter list. */
function processEmphasis(delims: DelimTok[]): void {
  // Each delimiter's index in `delims` doubles as its stack position; matched-
  // away or retired delimiters are marked dead (count 0 or `active` false).
  const active = delims.map(() => true);
  // Lower search bound per (char, closer-can-open, length mod 3), so a closer
  // never re-scans what an earlier closer of the same kind already searched.
  const bottom = new Map<string, number>();

  for (let ci = 0; ci < delims.length; ci++) {
    const closer = delims[ci]!;
    if (!active[ci] || !closer.canClose) continue;

    while (closer.count > 0) {
      const key = `${closer.ch}${closer.canOpen ? 1 : 0}${closer.count % 3}`;
      const floor = bottom.get(key) ?? -1;
      let oi = -1;
      for (let k = ci - 1; k > floor; k--) {
        const o = delims[k]!;
        if (!active[k] || o.count === 0 || !o.canOpen || o.ch !== closer.ch) continue;
        // Rule of 3: a run that can both open and close doesn't pair with one
        // whose lengths sum to a multiple of 3, unless both are.
        if ((o.canClose || closer.canOpen) && (o.count + closer.count) % 3 === 0
            && !(o.count % 3 === 0 && closer.count % 3 === 0)) continue;
        oi = k;
        break;
      }
      if (oi < 0) {
        bottom.set(key, ci - 1);
        if (!closer.canOpen) active[ci] = false;
        break;
      }

      const opener = delims[oi]!;
      const exact2 = DELIM_CHARS[closer.ch]!.exact2;
      const n = exact2 ? 2 : opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      const kind = closer.ch === "=" ? "mark" : closer.ch === "~" ? "s" : n === 2 ? "strong" : "em";

      // The content between opener and closer becomes the element's children.
      const first = opener.next === closer ? null : opener.next;
      const last = closer.prev!;
      let color: HighlightColor | null = null;
      if (kind === "mark") {
        if (!first) { active[oi] = false; continue; }
        const c = takeColor(first, last);
        if (c === undefined) { active[oi] = false; continue; }
        color = c;
      }
      if (!first) { active[oi] = false; continue; } // empty `****` content

      const elem: Elem = { kind, color, head: first };
      const tok: Tok = { t: "elem", elem, prev: opener, next: closer };
      first.prev = null;
      last.next = null;
      opener.next = tok;
      closer.prev = tok;
      // Delimiters inside the new element can no longer pair with outside ones.
      for (let k = oi + 1; k < ci; k++) active[k] = false;

      opener.count -= n;
      closer.count -= n;
      if (opener.count === 0) { unlink(opener); active[oi] = false; }
      if (closer.count === 0) { unlink(closer); active[ci] = false; }
    }
  }
}

function toNodes(head: Tok | null): InlineNode[] {
  const out: InlineNode[] = [];
  const pushText = (text: string): void => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.text += text;
    else out.push({ kind: "text", text });
  };
  for (let tok = head; tok; tok = tok.next) {
    if (tok.t === "text") pushText(tok.text);
    else if (tok.t === "delim") pushText(tok.ch.repeat(tok.count));
    else {
      const children = toNodes(tok.elem.head);
      out.push(tok.elem.kind === "mark"
        ? { kind: "mark", color: tok.elem.color, children }
        : { kind: tok.elem.kind, children });
    }
  }
  return out;
}

/** True when `text` contains any character that can format or escape.
 *  Lets plain labels skip parsing and DOM work. */
export function hasInlineMarkup(text: string): boolean {
  return /[*_~=\\]/.test(text);
}

/** Parses `text` into inline nodes. Unmatched markers stay as text. */
export function parseInline(text: string): InlineNode[] {
  if (!text) return [];
  if (text.length > MAX_PARSE_LENGTH || !hasInlineMarkup(text)) return [{ kind: "text", text }];
  const { head, delims } = tokenize(text);
  processEmphasis(delims);
  return toNodes(head);
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
  if (!hasInlineMarkup(text)) return text;
  return nodesToText(parseInline(text));
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
