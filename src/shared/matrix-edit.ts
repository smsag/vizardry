import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

/**
 * Write-back for matrix `item:` lines. Both operations locate the
 * `item: <Label>` header inside the fence (prefix match, tolerating a trailing
 * `[x,y]` or `at: tN` position token):
 *
 *  - writeItemPosition: rewrite the header to `item: <Label> [x, y]` after a drag.
 *  - writeItemContent:  replace the item's indented body after an edit.
 */

const COORD_RE = /\[\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\]/;
const AT_RE = /\bat:\s*t\d+\b/i;

type ItemLocation = {
  headerLine: number;
  labelText: string; // label as written (original case, position token stripped)
  bodyStart: number;
  bodyEnd: number;   // bodyEnd < bodyStart means the body is currently empty
};

function findItem(editor: Editor, lineStart: number, lineEnd: number, itemLabel: string): ItemLocation | null {
  const targetPrefix = `item: ${itemLabel.toLowerCase()}`;
  let headerLine = -1;
  let labelText = itemLabel;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim();
    const normalised = trimmed.toLowerCase();
    if (normalised.startsWith(targetPrefix)) {
      const after = normalised.slice(targetPrefix.length).trimStart();
      if (after === "" || after.startsWith("[") || after.startsWith("at:")) {
        headerLine = ln;
        labelText = trimmed.slice("item:".length).replace(COORD_RE, "").replace(AT_RE, "").trim();
        break;
      }
    }
  }
  if (headerLine === -1) return null;

  let bodyStart = headerLine + 1;
  let bodyEnd = bodyStart - 1;
  for (let ln = bodyStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (raw.trim() !== "" && !raw.startsWith(" ") && !raw.startsWith("\t")) break;
    bodyEnd = ln;
  }
  return { headerLine, labelText, bodyStart, bodyEnd };
}

/** Rewrites the header with fresh `[x, y]` coordinates (2 dp), dropping any
 *  previous `[x,y]` or `at: tN` token and preserving the label text. */
export function writeItemPosition(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  itemLabel: string,
  x: number,
  y: number,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeItemPosition");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const loc = findItem(editor, lineStart, lineEnd, itemLabel);
  if (!loc) {
    console.warn(`Vizardry: writeItemPosition — item "${itemLabel}" not found in lines ${lineStart}–${lineEnd}`);
    return false;
  }

  const rx = Math.round(x * 100) / 100;
  const ry = Math.round(y * 100) / 100;
  const newHeader = `item: ${loc.labelText} [${rx}, ${ry}]`;
  editor.replaceRange(
    newHeader,
    { line: loc.headerLine, ch: 0 },
    { line: loc.headerLine, ch: editor.getLine(loc.headerLine).length },
  );
  return true;
}

export function writeItemContent(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  itemLabel: string,
  newValue: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeItemContent");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const loc = findItem(editor, lineStart, lineEnd, itemLabel);
  if (!loc) {
    console.warn(`Vizardry: writeItemContent — item "${itemLabel}" not found in lines ${lineStart}–${lineEnd}`);
    return false;
  }

  const trimmed = newValue.trim();
  const indented = trimmed === "" ? "" : trimmed.split("\n").map(l => `  ${l}`).join("\n");

  if (loc.bodyEnd >= loc.bodyStart) {
    const to = { line: loc.bodyEnd, ch: editor.getLine(loc.bodyEnd).length };
    editor.replaceRange(indented, { line: loc.bodyStart, ch: 0 }, to);
  } else if (indented !== "") {
    const headerLen = editor.getLine(loc.headerLine).length;
    editor.replaceRange("\n" + indented, { line: loc.headerLine, ch: headerLen });
  }
  return true;
}
