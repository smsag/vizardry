import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { canonKey } from "../compass";

/**
 * Source write-back for the Product Compass. Every rendered line is one
 * top-level `keyword: value` line, so editing is a single-line rewrite. Lines
 * are located the same way the other canvases locate blocks — scan the fence's
 * line range, keep the recognised `keyword: value` lines (mirroring the parser:
 * skippable / empty-value / unknown-key lines are dropped) — so the Nth
 * surviving line of a given canonical key is the Nth item of that section,
 * matching the parsed arrays' order.
 *
 * The raw value is preserved verbatim (including any `[label](canvas:…)`
 * annotation), so editing reveals and keeps the raw markup rather than dropping
 * the link.
 */

interface LineReader { getLine(n: number): string }

/** Absolute editor line numbers of the recognised compass lines, with their
 *  canonical key, in source order. */
function compassLines(editor: LineReader, lineStart: number, lineEnd: number): { key: string; line: number }[] {
  const out: { key: string; line: number }[] = [];
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (raw.search(/\S/) !== 0) continue; // top-level only
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const rawKey = trimmed.slice(0, colon).trim();
    const lower = rawKey.toLowerCase();
    if (lower === "title" || lower === "collapsed") continue;
    if (!trimmed.slice(colon + 1).trim()) continue; // empty value — parser skips it
    const key = canonKey(rawKey);
    if (!key) continue; // unknown keyword — not a rendered line
    out.push({ key, line: ln });
  }
  return out;
}

/** The absolute line of the `index`-th line of canonical `key`, or -1. */
function nthLine(editor: LineReader, lineStart: number, lineEnd: number, key: string, index: number): number {
  const lines = compassLines(editor, lineStart, lineEnd).filter(l => l.key === key);
  return lines[index]?.line ?? -1;
}

/** Reads the raw value (verbatim, annotations kept) of the `index`-th `key`
 *  line, or null when not found / no editor. */
export function readCompassValue(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  key: string, index: number,
): string | null {
  const resolved = resolveEditor(app, ctx, el, "readCompassValue");
  if (!resolved) return null;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = nthLine(editor, lineStart, lineEnd, key, index);
  if (ln === -1) return null;
  const raw = editor.getLine(ln);
  const colon = raw.indexOf(":");
  return colon === -1 ? null : raw.slice(colon + 1).trim();
}

/** Rewrites the value of the `index`-th `key` line, preserving its keyword and
 *  indentation. Returns false in Read View / if not found. */
export function writeCompassValue(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  key: string, index: number, value: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeCompassValue");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = nthLine(editor, lineStart, lineEnd, key, index);
  if (ln === -1) return false;
  const raw = editor.getLine(ln);
  const colon = raw.indexOf(":");
  if (colon === -1) return false;
  const clean = value.replace(/\s+/g, " ").trim();
  editor.replaceRange(
    `${raw.slice(0, colon + 1)} ${clean}`,
    { line: ln, ch: 0 },
    { line: ln, ch: raw.length },
  );
  return true;
}

/** Deletes the `index`-th `key` line. Returns false if not found. */
export function removeCompassValue(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  key: string, index: number,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "removeCompassValue");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = nthLine(editor, lineStart, lineEnd, key, index);
  if (ln === -1) return false;
  editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
  return true;
}

/** Appends a new `key: placeholder` line after that key's last line (or before
 *  the closing fence when the key has none). Returns false if unavailable. */
export function insertCompassValue(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  key: string, placeholder: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "insertCompassValue");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const lines = compassLines(editor, lineStart, lineEnd);
  let after = -1;
  for (const l of lines) if (l.key === key) after = l.line;
  if (after === -1) {
    // No line of this key yet — insert after the last content line inside the fence.
    after = lineEnd - 1;
    while (after > lineStart && editor.getLine(after).trim() === "") after--;
  }
  const raw = editor.getLine(after);
  editor.replaceRange(`\n${key}: ${placeholder}`, { line: after, ch: raw.length });
  return true;
}
