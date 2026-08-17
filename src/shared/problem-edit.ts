import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";
import { isSkippableLine } from "./indent-tree";

/**
 * Source write-back for the Problem canvas. Each card is one top-level
 * `<stage>_<n>: heading | body` line, so editing a card is a single-line
 * rewrite. Cards are located the same way SIPOC/story locate their blocks — by
 * scanning the code block's line range and re-applying the parser's filtering
 * (skippable / `title:` / `link:` / non-stage lines are skipped) — so the Nth
 * surviving line is the Nth card, matching `data.nodes` order. This keeps
 * write-back robust even when ids are auto-assigned (a bare `reality:` line has
 * no literal `reality_2` to grep for).
 */

interface LineReader { getLine(n: number): string }

function stageOf(key: string): string {
  const us = key.indexOf("_");
  return us === -1 ? key : key.slice(0, us);
}

/** Absolute editor line numbers of the card lines, in source order. */
function cardLines(
  editor: LineReader,
  lineStart: number,
  lineEnd: number,
  stageKeys: Set<string>,
): number[] {
  const out: number[] = [];
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim();
    if (isSkippableLine(trimmed)) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    if (key === "title" || key === "link") continue;
    if (!stageKeys.has(stageOf(key))) continue;
    // Mirror the parser: a line whose value has neither a heading nor a body is
    // not a card (it's skipped), so it must not shift the card index either.
    const value = trimmed.slice(colon + 1).trim();
    const bar = value.indexOf("|");
    const heading = (bar === -1 ? value : value.slice(0, bar)).trim();
    const body = bar === -1 ? "" : value.slice(bar + 1).trim();
    if (!heading && !body) continue;
    out.push(ln);
  }
  return out;
}

/** Encodes a card's value as `heading | body` (or just `heading` when empty). */
function encodeValue(heading: string, body: string): string {
  const h = heading.replace(/\s+/g, " ").trim();
  const b = body.replace(/\s+/g, " ").trim();
  return b ? `${h} | ${b}` : h;
}

/** Rewrites the `heading | body` value of the `cardIndex`-th card, preserving
 *  the key (id) and indentation. Returns false in Read View / if not found. */
export function writeProblemCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  cardIndex: number,
  stageKeys: string[],
  heading: string,
  body: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeProblemCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = cardLines(editor, lineStart, lineEnd, new Set(stageKeys))[cardIndex];
  if (ln === undefined) return false;

  const raw = editor.getLine(ln);
  const colon = raw.indexOf(":");
  if (colon === -1) return false;
  const value = encodeValue(heading, body);
  editorWrite(() => {
    editor.replaceRange(
      `${raw.slice(0, colon + 1)} ${value}`,
      { line: ln, ch: 0 },
      { line: ln, ch: raw.length },
    );
  }, el);
  return true;
}

/** Deletes the `cardIndex`-th card's line. Returns false if not found. */
export function removeProblemCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  cardIndex: number,
  stageKeys: string[],
): boolean {
  const resolved = resolveEditor(app, ctx, el, "removeProblemCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = cardLines(editor, lineStart, lineEnd, new Set(stageKeys))[cardIndex];
  if (ln === undefined) return false;
  // Remove the whole line, including its newline (fold into the next line).
  editorWrite(() => {
    editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
  }, el);
  return true;
}

/** Appends a new card of `stageKey` after that stage's last card (or before the
 *  closing fence when the stage has none). The card carries `placeholder` text
 *  so it parses (a blank card would be skipped). Returns false if unavailable. */
export function insertProblemCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  stageKey: string,
  stageKeys: string[],
  placeholder: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "insertProblemCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const lines = cardLines(editor, lineStart, lineEnd, new Set(stageKeys));
  let after = -1;
  for (const ln of lines) {
    const trimmed = editor.getLine(ln).trim();
    const key = trimmed.slice(0, trimmed.indexOf(":")).trim().toLowerCase();
    if (stageOf(key) === stageKey) after = ln;
  }
  // Fall back to the last content line inside the fence (lineEnd is the closing
  // fence; step back over trailing blanks so the card sits flush).
  if (after === -1) {
    after = lineEnd - 1;
    while (after > lineStart && editor.getLine(after).trim() === "") after--;
  }

  const raw = editor.getLine(after);
  editorWrite(() => {
    editor.replaceRange(`\n${stageKey}: ${placeholder}`, { line: after, ch: raw.length });
  }, el);
  return true;
}
