import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

/**
 * Source write-back for the Test Card. Every value — step text, a gauge level,
 * the deadline — is a single top-level `key: value` line, so a write is an
 * upsert of that one line (or a delete when the value is empty / a gauge is
 * cleared to 0). Mirrors `period-edit` but keyed, since the card has several
 * such fields. Order is ignored by the parser, so a newly-added line is simply
 * appended just before the closing fence.
 */

/** Upserts (or, when `value` is empty, removes) the top-level `key: value`
 *  line. Returns false in Read View / when no editor is available. */
export function writeTestCardField(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  key: string,
  value: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeTestCardField");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const want = key.toLowerCase();
  const clean = value.replace(/\s+/g, " ").trim();

  let target = -1;
  let lastContent = lineStart; // fall back to just after the opening fence
  for (let ln = lineStart + 1; ln < lineEnd; ln++) {
    const line = editor.getLine(ln);
    if (line.search(/\S/) !== 0) continue; // top-level only
    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon !== -1 && trimmed.slice(0, colon).trim().toLowerCase() === want) target = ln;
    lastContent = ln;
  }

  if (!clean) {
    if (target !== -1) editor.replaceRange("", { line: target, ch: 0 }, { line: target + 1, ch: 0 });
    return true;
  }

  const text = `${key}: ${clean}`;
  if (target !== -1) {
    editor.replaceRange(text, { line: target, ch: 0 }, { line: target, ch: editor.getLine(target).length });
  } else {
    // Append after the last content line inside the fence.
    editor.replaceRange(`\n${text}`, { line: lastContent, ch: editor.getLine(lastContent).length });
  }
  return true;
}

/** Writes a gauge level (1..max) or clears the line when `level` is 0. */
export function writeTestCardGauge(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  key: string,
  level: number,
): boolean {
  return writeTestCardField(app, ctx, el, key, level > 0 ? String(level) : "");
}
