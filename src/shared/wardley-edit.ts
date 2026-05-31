import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

/**
 * Writes updated [visibility, evolution] coordinates for a Wardley Map
 * component back into its source code block.
 *
 * Finds the `component: <name> [...]` line within the block's line range
 * and replaces only the coordinate pair, leaving all other syntax intact.
 *
 * Returns false if the editor is unavailable (Read View) or the component
 * line cannot be located.
 */
export function writeWardleyComponent(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  componentName: string,
  visibility: number,
  evolution: number,
): boolean {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry: writeWardleyComponent — no section info");
    return false;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: writeWardleyComponent — file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn("Vizardry: writeWardleyComponent — no live editor");
    return false;
  }

  const { lineStart, lineEnd } = info;
  const targetPrefix = `component: ${componentName.toLowerCase()}`;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (raw.trim().toLowerCase().startsWith(targetPrefix)) {
      // Replace the [vis, evo] bracket pair in-place, preserving inline comments
      const newLine = raw.replace(
        /\[[^\]]+\]/,
        `[${visibility.toFixed(2)}, ${evolution.toFixed(2)}]`,
      );
      editor.replaceRange(newLine, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
      return true;
    }
  }

  console.warn(`Vizardry: writeWardleyComponent — component "${componentName}" not found in source`);
  return false;
}

/**
 * Inserts a new Wardley Map component into the source block, positioned
 * directly after the source component's line.
 *
 * If `withLink` is true, also inserts a `link: source -> newName` line
 * immediately before the closing fence of the code block.
 *
 * Insertions are performed bottom-up (link first, then component) so that
 * inserting at the higher line number doesn't shift the lower line number.
 *
 * Returns false if the editor is unavailable or the source component cannot
 * be located.
 */
export function addWardleyComponent(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  sourceComponentName: string,
  newName: string,
  visibility: number,
  evolution: number,
  withLink: boolean,
): boolean {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry: addWardleyComponent — no section info");
    return false;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: addWardleyComponent — file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn("Vizardry: addWardleyComponent — no live editor");
    return false;
  }

  const { lineStart, lineEnd } = info;
  const sourcePrefix = `component: ${sourceComponentName.toLowerCase()}`;
  let sourceCompLine = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(sourcePrefix)) {
      sourceCompLine = ln;
      break;
    }
  }

  if (sourceCompLine === -1) {
    console.warn(`Vizardry: addWardleyComponent — source "${sourceComponentName}" not found`);
    return false;
  }

  const coords = `[${visibility.toFixed(2)}, ${evolution.toFixed(2)}]`;

  // Bottom-up: insert link before closing fence first (higher line), then
  // insert component after source line (lower line) — avoids line-shift issues.
  if (withLink) {
    editor.replaceRange(
      `link: ${sourceComponentName} -> ${newName}\n`,
      { line: lineEnd, ch: 0 },
    );
  }

  const sourceLineText = editor.getLine(sourceCompLine);
  editor.replaceRange(
    `\ncomponent: ${newName} ${coords}`,
    { line: sourceCompLine, ch: sourceLineText.length },
  );

  return true;
}
