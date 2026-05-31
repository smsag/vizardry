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
