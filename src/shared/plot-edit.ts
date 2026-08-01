import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

/**
 * Write-back for `layout: plot` items. Two operations, both locating the
 * `item: <Label>` header inside the fence the same way (prefix + `|`/end match,
 * mirroring findBlockBody's contract for `block:`):
 *
 *  - writeItemPosition: rewrite the header's `x:`/`y:` modifier after a drag.
 *  - writeItemContent:  replace the item's indented body after an edit.
 */

type ItemLocation = {
  headerLine: number;
  /** The label text exactly as written in source (original case). */
  labelText: string;
  bodyStart: number;
  bodyEnd: number; // bodyEnd < bodyStart means the body is currently empty
};

function findItem(editor: Editor, lineStart: number, lineEnd: number, itemLabel: string): ItemLocation | null {
  const targetPrefix = `item: ${itemLabel.toLowerCase()}`;
  let headerLine = -1;
  let labelText = itemLabel;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    const trimmed = raw.trim();
    const normalised = trimmed.toLowerCase();
    if (normalised.startsWith(targetPrefix)) {
      const after = normalised.slice(targetPrefix.length).trimStart();
      if (after === "" || after.startsWith("|")) {
        headerLine = ln;
        const value = trimmed.slice("item:".length);
        const pipeIdx = value.indexOf("|");
        labelText = (pipeIdx !== -1 ? value.slice(0, pipeIdx) : value).trim();
        break;
      }
    }
  }
  if (headerLine === -1) return null;

  let bodyStart = headerLine + 1;
  let bodyEnd = bodyStart - 1;
  for (let ln = bodyStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    const trimmed = raw.trim();
    if (trimmed !== "" && !raw.startsWith(" ") && !raw.startsWith("\t")) break;
    bodyEnd = ln;
  }
  return { headerLine, labelText, bodyStart, bodyEnd };
}

/** Rewrites the `item:` header line with fresh coordinates, preserving the
 *  label's original text. Coordinates are rounded to 2 dp to limit diff churn. */
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
  const newHeader = `item: ${loc.labelText} | x: ${rx}, y: ${ry}`;
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
