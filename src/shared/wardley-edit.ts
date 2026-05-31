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

/** Escapes a string for use inside a RegExp. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Renames a Wardley Map component throughout its source block — updating the
 * `component:` line, any `anchor:` line, and all `link:` references.
 *
 * All replacements are in-place (same line, different text) so line numbers
 * do not shift and order does not matter.
 *
 * Returns false if the editor is unavailable or the component is not found.
 */
export function renameWardleyComponent(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldName: string,
  newName: string,
): boolean {
  if (!newName.trim() || newName === oldName) return false;

  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry: renameWardleyComponent — no section info");
    return false;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: renameWardleyComponent — file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn("Vizardry: renameWardleyComponent — no live editor");
    return false;
  }

  const { lineStart, lineEnd } = info;
  const old = escRe(oldName);

  // Patterns (case-insensitive so they work regardless of how the user typed the name)
  const reComp   = new RegExp(`^(\\s*component:\\s*)${old}(\\s*\\[)`, "i");
  const reAnchor = new RegExp(`^(\\s*anchor:\\s*)${old}\\s*$`, "i");
  const reLinkFrom = new RegExp(`^(\\s*link:\\s*)${old}(\\s*->)`, "i");
  const reLinkTo   = new RegExp(`(->[\\s]*)${old}(\\s*(?:#.*)?$)`, "i");

  let found = false;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);

    let updated: string | null = null;
    if (reComp.test(raw))    updated = raw.replace(reComp,   `$1${newName}$2`);
    else if (reAnchor.test(raw)) updated = raw.replace(reAnchor, `$1${newName}`);
    else if (reLinkFrom.test(raw)) updated = raw.replace(reLinkFrom, `$1${newName}$2`);
    else if (reLinkTo.test(raw))   updated = raw.replace(reLinkTo,   `$1${newName}$2`);

    if (updated !== null) {
      editor.replaceRange(updated, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
      found = true;
    }
  }

  if (!found) {
    console.warn(`Vizardry: renameWardleyComponent — "${oldName}" not found in source`);
  }
  return found;
}
