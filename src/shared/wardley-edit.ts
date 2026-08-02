import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

function resolveUniqueComponentName(
  editor: { getLine: (line: number) => string },
  lineStart: number,
  lineEnd: number,
  baseName: string,
): string {
  const existingNames = new Set<string>();
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln).trim();
    const match = raw.match(/^component:\s*(.*?)\s*\[/i);
    if (!match) continue;
    const name = match[1].trim().toLowerCase();
    if (name) existingNames.add(name);
  }

  const normalizedBase = baseName.trim() || "New Component";
  if (!existingNames.has(normalizedBase.toLowerCase())) return normalizedBase;

  let index = 2;
  while (existingNames.has(`${normalizedBase} ${index}`.toLowerCase())) {
    index++;
  }
  return `${normalizedBase} ${index}`;
}

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
  const resolved = resolveEditor(app, ctx, el, "writeWardleyComponent");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  // Require the `[` boundary so "Auth" doesn't match "component: Auth Service [...]".
  const targetRe = new RegExp(`^component:\\s*${escRe(componentName)}\\s*\\[`, "i");

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (targetRe.test(raw.trim())) {
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
  const resolved = resolveEditor(app, ctx, el, "addWardleyComponent");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  // Require the `[` boundary so a prefix name can't match a longer component.
  const sourceRe = new RegExp(`^component:\\s*${escRe(sourceComponentName)}\\s*\\[`, "i");
  const resolvedName = resolveUniqueComponentName(editor, lineStart, lineEnd, newName);
  let sourceCompLine = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    if (sourceRe.test(editor.getLine(ln).trim())) {
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
      `link: ${sourceComponentName} -> ${resolvedName}\n`,
      { line: lineEnd, ch: 0 },
    );
  }

  const sourceLineText = editor.getLine(sourceCompLine);
  editor.replaceRange(
    `\ncomponent: ${resolvedName} ${coords}`,
    { line: sourceCompLine, ch: sourceLineText.length },
  );

  return true;
}

/** Escapes a string for use inside a RegExp. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Updates the target evolution value on an `evolve: <name> <value>` line after
 * the to-be marker is dragged. The name is matched with a `\s+<number>`
 * boundary (so "Auth" doesn't match "Auth Service …"), and only the trailing
 * number is rewritten — any trailing `//` comment is preserved.
 *
 * Returns false if the editor is unavailable or the evolve line is not found.
 */
export function writeWardleyEvolve(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  componentName: string,
  evolveTo: number,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeWardleyEvolve");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const findRe = new RegExp(`^evolve:\\s*${escRe(componentName)}\\s+[0-9]*\\.?[0-9]+`, "i");

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (findRe.test(raw.trim())) {
      // Replace the trailing number, keeping any `// comment` after it.
      const newLine = raw.replace(/([0-9]*\.?[0-9]+)(\s*(?:\/\/.*)?)$/, `${evolveTo.toFixed(2)}$2`);
      editor.replaceRange(newLine, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
      return true;
    }
  }

  console.warn(`Vizardry: writeWardleyEvolve — evolve for "${componentName}" not found`);
  return false;
}

/**
 * Renames a Wardley Map component throughout its source block — updating the
 * `component:` line, any `anchor:` line, all `link:` references, and any
 * `evolve:` / `pipeline:` directive that targets it.
 *
 * All replacements are in-place (same line, different text) so line numbers
 * do not shift and order does not matter.
 *
 * Aborts (returns false, touching nothing) if `newName` would collide with a
 * different existing component — renaming onto an existing name would create a
 * duplicate `component:` line and break the map on the next parse.
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

  const resolved = resolveEditor(app, ctx, el, "renameWardleyComponent");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const old = escRe(oldName);

  // Guard against renaming onto a different existing component — that would
  // leave two `component:` lines with the same name and break parsing.
  const newLower = newName.trim().toLowerCase();
  const oldLower = oldName.trim().toLowerCase();
  if (newLower !== oldLower) {
    for (let ln = lineStart; ln <= lineEnd; ln++) {
      const m = editor.getLine(ln).trim().match(/^component:\s*(.*?)\s*\[/i);
      if (m && m[1].trim().toLowerCase() === newLower) {
        console.warn(`Vizardry: renameWardleyComponent — "${newName}" already exists; rename aborted`);
        return false;
      }
    }
  }

  // Patterns (case-insensitive so they work regardless of how the user typed the name).
  // evolve/pipeline use a value-start boundary (a number begins with a digit or
  // a dot) so a prefix name can't match a longer component's directive.
  const reComp   = new RegExp(`^(\\s*component:\\s*)${old}(\\s*\\[)`, "i");
  const reAnchor = new RegExp(`^(\\s*anchor:\\s*)${old}\\s*$`, "i");
  const reLinkFrom = new RegExp(`^(\\s*link:\\s*)${old}(\\s*->)`, "i");
  const reLinkTo   = new RegExp(`(->[\\s]*)${old}(\\s*(?://.*)?$)`, "i");
  const reEvolve   = new RegExp(`^(\\s*evolve:\\s*)${old}(\\s+[.0-9])`, "i");
  const rePipeline = new RegExp(`^(\\s*pipeline:\\s*)${old}(\\s*\\[)`, "i");

  let found = false;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);

    let updated: string | null = null;
    if (reComp.test(raw))    updated = raw.replace(reComp,   `$1${newName}$2`);
    else if (reAnchor.test(raw)) updated = raw.replace(reAnchor, `$1${newName}`);
    else if (reLinkFrom.test(raw)) updated = raw.replace(reLinkFrom, `$1${newName}$2`);
    else if (reLinkTo.test(raw))   updated = raw.replace(reLinkTo,   `$1${newName}$2`);
    else if (reEvolve.test(raw))   updated = raw.replace(reEvolve,   `$1${newName}$2`);
    else if (rePipeline.test(raw)) updated = raw.replace(rePipeline, `$1${newName}$2`);

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

/**
 * Removes a `link: from -> to` line from the source block.
 * Matches case-insensitively to be consistent with how links are stored.
 * Returns false if the editor is unavailable or the link line cannot be found.
 */
export function removeWardleyLink(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  fromName: string,
  toName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "removeWardleyLink");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const from = escRe(fromName);
  const to = escRe(toName);
  const reLink = new RegExp(`^\\s*link:\\s*${from}\\s*->\\s*${to}\\s*(?://.*)?$`, "i");

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    if (reLink.test(editor.getLine(ln))) {
      editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
      return true;
    }
  }

  console.warn(`Vizardry: removeWardleyLink — link "${fromName} -> ${toName}" not found`);
  return false;
}
