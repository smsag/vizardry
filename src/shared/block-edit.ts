import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

/**
 * Writes updated block content back into the source code block.
 *
 * Strategy: use ctx.getSectionInfo(el) to locate the exact line range of
 * the code block, then scan for the "block: <Label>" header line within
 * that range and replace everything between it and the next top-level line
 * (or end of block) with the new value.
 *
 * Returns false if we couldn't find a writable editor (reading mode, etc.).
 */
export function writeBlockContent(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  blockLabel: string,
  newValue: string,
): boolean {
  const info = ctx.getSectionInfo(el);
  if (!info) return false;

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) return false;

  // Find a live editor for this file
  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) return false;

  const { lineStart, lineEnd } = info;

  // Find the "block: <Label>" line (case-insensitive) inside the code block
  const targetPrefix = `block: ${blockLabel.toLowerCase()}`;
  let blockHeaderLine = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    if (raw.trim().toLowerCase() === targetPrefix) {
      blockHeaderLine = ln;
      break;
    }
  }

  if (blockHeaderLine === -1) return false;

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
