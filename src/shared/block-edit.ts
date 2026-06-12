import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

/**
 * Writes updated block content back into the source code block.
 *
 * Strategy: use ctx.getSectionInfo(el) to locate the exact line range of
 * the code block, then scan for the "block: <Label>" header line within
 * that range and replace everything between it and the next top-level line
 * (or end of block) with the new value.
 *
 * Returns false if we couldn't find a writable editor (reading mode, etc.).
 * Each failure path emits a console.warn so it is diagnosable without
 * requiring the user to reproduce the issue.
 */
export function writeBlockContent(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  blockLabel: string,
  newValue: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeBlockContent");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  // Find the "block: <Label>" line (case-insensitive) inside the code block.
  // The line may carry a display-mode modifier: "block: Label | card"
  // so we match on prefix + (end-of-line or pipe).
  const targetPrefix = `block: ${blockLabel.toLowerCase()}`;
  let blockHeaderLine = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    const normalised = raw.trim().toLowerCase();
    if (normalised.startsWith(targetPrefix)) {
      const after = normalised.slice(targetPrefix.length).trimStart();
      if (after === "" || after.startsWith("|")) {
        blockHeaderLine = ln;
        break;
      }
    }
  }

  if (blockHeaderLine === -1) {
    console.warn(`Vizardry: writeBlockContent — block "${blockLabel}" not found in lines ${lineStart}–${lineEnd}`);
    return false;
  }

  // Find the range of indented lines that follow (the block body)
  let bodyStart = blockHeaderLine + 1;
  let bodyEnd = bodyStart - 1; // exclusive

  for (let ln = bodyStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    const trimmed = raw.trim();
    // Stop at next top-level line (zero-indent non-empty, or closing ```)
    if (trimmed !== "" && !raw.startsWith(" ") && !raw.startsWith("\t")) break;
    bodyEnd = ln;
  }

  // Build replacement: two-space-indented lines, or empty if value is blank
  const trimmed = newValue.trim();
  const indentedLines = trimmed === ""
    ? ""
    : trimmed.split("\n").map(l => `  ${l}`).join("\n") + "\n";

  const from = { line: bodyStart, ch: 0 };

  if (bodyEnd >= bodyStart) {
    // Replace existing body lines
    const lastLineLen: number = editor.getLine(bodyEnd).length;
    const to = { line: bodyEnd, ch: lastLineLen };
    editor.replaceRange(indentedLines.replace(/\n$/, ""), from, to);
  } else {
    // No existing body — insert after the block: header line
    const headerLen: number = editor.getLine(blockHeaderLine).length;
    editor.replaceRange(
      "\n" + indentedLines.replace(/\n$/, ""),
      { line: blockHeaderLine, ch: headerLen }
    );
  }

  return true;
}
