import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

/**
 * Writes an updated cell value back into the source code block for a
 * pace-layers canvas.
 *
 * Locates `layer: <layerName>` within the code block's line range, then
 * either replaces the existing `<cellKey>: value` line within that layer
 * block or inserts one if the key was absent.
 *
 * Returns false if the editor is unavailable (Reading View) or the layer
 * cannot be located.
 */
export function writePaceLayerCell(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  layerName: string,
  cellKey: string,
  newValue: string,
): boolean {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry: writePaceLayerCell — no section info");
    return false;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: writePaceLayerCell — file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn("Vizardry: writePaceLayerCell — no live editor");
    return false;
  }

  const { lineStart, lineEnd } = info;

  // Locate `layer: <layerName>` at zero indent (case-insensitive)
  const targetHeader = `layer: ${layerName.toLowerCase()}`;
  let layerHeaderLine = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    if (raw.trim().toLowerCase() === targetHeader) {
      layerHeaderLine = ln;
      break;
    }
  }

  if (layerHeaderLine === -1) {
    console.warn(`Vizardry: writePaceLayerCell — layer "${layerName}" not found in lines ${lineStart}–${lineEnd}`);
    return false;
  }

  // Determine the layer body end: scan forward collecting blank or indented lines
  let layerBodyEnd = layerHeaderLine;
  for (let ln = layerHeaderLine + 1; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    const trimmed = raw.trim();
    // Stop at next zero-indent non-blank line (next layer or closing fence)
    if (trimmed !== '' && !raw.startsWith(' ') && !raw.startsWith('\t')) break;
    layerBodyEnd = ln;
  }

  // Find the `<cellKey>:` line within the layer body
  const targetPrefix = `${cellKey.toLowerCase()}:`;
  let cellLine = -1;

  for (let ln = layerHeaderLine + 1; ln <= layerBodyEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(targetPrefix)) {
      cellLine = ln;
      break;
    }
  }

  if (cellLine !== -1) {
    // Replace the existing value, preserving indent
    const raw: string = editor.getLine(cellLine);
    const indent = raw.match(/^(\s*)/)?.[1] ?? '  ';
    editor.replaceRange(
      `${indent}${cellKey}: ${newValue}`,
      { line: cellLine, ch: 0 },
      { line: cellLine, ch: raw.length },
    );
  } else {
    // Key absent — insert after the last non-blank, non-comment line in the layer body
    let insertAfter = layerHeaderLine;
    for (let ln = layerHeaderLine + 1; ln <= layerBodyEnd; ln++) {
      const t = editor.getLine(ln).trim();
      if (t && !t.startsWith('//')) insertAfter = ln;
    }
    const insertLineText: string = editor.getLine(insertAfter);
    editor.replaceRange(
      `\n  ${cellKey}: ${newValue}`,
      { line: insertAfter, ch: insertLineText.length },
    );
  }

  return true;
}
