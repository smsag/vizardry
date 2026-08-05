import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

export const PERIOD_MAX_LENGTH = 60;

/**
 * Extracts the `period: ...` line from a canvas source block (a free-text
 * timeframe like "May – Jul 2025"). Returns "" when absent.
 */
export function parsePeriod(source: string): string {
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("period:")) {
      return trimmed.slice("period:".length).trim().slice(0, PERIOD_MAX_LENGTH);
    }
  }
  return "";
}

/**
 * Writes, replaces, or (when `newPeriod` is empty) removes the `period:` line
 * in the canvas source block. Inserts it just after the `title:` line when one
 * exists, otherwise right after the opening fence. Returns false if no writable
 * editor could be found.
 */
export function writeCanvasPeriod(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  newPeriod: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeCanvasPeriod");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const value = newPeriod.trim().slice(0, PERIOD_MAX_LENGTH);

  let periodLine = -1;
  let titleLine = -1;
  for (let ln = lineStart + 1; ln < lineEnd; ln++) {
    const t = editor.getLine(ln).trim().toLowerCase();
    if (periodLine === -1 && t.startsWith("period:")) periodLine = ln;
    if (titleLine === -1 && t.startsWith("title:")) titleLine = ln;
  }

  if (!value) {
    if (periodLine !== -1) {
      editor.replaceRange("", { line: periodLine, ch: 0 }, { line: periodLine + 1, ch: 0 });
    }
    return true;
  }

  const text = `period: ${value}`;
  if (periodLine !== -1) {
    editor.replaceRange(text, { line: periodLine, ch: 0 }, { line: periodLine, ch: editor.getLine(periodLine).length });
  } else {
    const insertAt = (titleLine !== -1 ? titleLine : lineStart) + 1;
    editor.replaceRange(text + "\n", { line: insertAt, ch: 0 });
  }
  return true;
}
