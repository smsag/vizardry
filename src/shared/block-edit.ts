import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";

type BlockLocation = {
  blockHeaderLine: number;
  bodyStart: number;
  bodyEnd: number; // bodyEnd < bodyStart means the body is currently empty
};

/**
 * Finds the "block: <Label>" line (case-insensitive) inside [lineStart, lineEnd]
 * and the range of indented lines that follow it (the block's body). The
 * header line may carry a display-mode modifier ("block: Label | card"), so
 * matching is on prefix + (end-of-line or pipe).
 */
function findBlockBody(editor: Editor, lineStart: number, lineEnd: number, blockLabel: string): BlockLocation | null {
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
  if (blockHeaderLine === -1) return null;

  let bodyStart = blockHeaderLine + 1;
  let bodyEnd = bodyStart - 1; // exclusive

  for (let ln = bodyStart; ln <= lineEnd; ln++) {
    const raw: string = editor.getLine(ln);
    const trimmed = raw.trim();
    // Stop at next top-level line (zero-indent non-empty, or closing ```)
    if (trimmed !== "" && !raw.startsWith(" ") && !raw.startsWith("\t")) break;
    bodyEnd = ln;
  }

  return { blockHeaderLine, bodyStart, bodyEnd };
}

/** Replaces a block's body lines with newValue (or inserts it after the header if the body was empty). */
function applyBlockEdit(editor: Editor, loc: BlockLocation, newValue: string): void {
  // Build replacement: two-space-indented lines, or empty if value is blank
  const trimmed = newValue.trim();
  const indentedLines = trimmed === ""
    ? ""
    : trimmed.split("\n").map(l => `  ${l}`).join("\n") + "\n";

  const { blockHeaderLine, bodyStart, bodyEnd } = loc;
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
}

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

  const loc = findBlockBody(editor, lineStart, lineEnd, blockLabel);
  if (!loc) {
    console.warn(`Vizardry: writeBlockContent — block "${blockLabel}" not found in lines ${lineStart}–${lineEnd}`);
    return false;
  }

  editorWrite(() => applyBlockEdit(editor, loc, newValue), el);
  return true;
}

/**
 * Moves a card between two blocks in the SAME code fence as a single atomic
 * operation — both blocks are located from one fresh editor scan, then
 * edited bottom-up (the one lower in the file first) so neither edit's line
 * numbers are invalidated by the other.
 *
 * This exists because calling writeBlockContent() twice in a row for a
 * cross-block move doesn't work reliably: resolveEditor() re-resolves on
 * every call, but its non-null-but-stale detection cross-checks against the
 * container's `vzSource` snapshot (captured once at render time). After the
 * first write already changed the document, that snapshot no longer matches
 * the live content, so the second call's staleness check fails and its
 * full-document fallback scan — which also compares against the same stale
 * snapshot — can't find the fence either. The result is a write that
 * silently drops (the card vanishes instead of moving) roughly as often as
 * Obsidian's cached section info happens to be non-null at that moment.
 */
export function moveCardBetweenBlocks(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  source: { label: string; newContent: string },
  dest: { label: string; newContent: string },
): boolean {
  const resolved = resolveEditor(app, ctx, el, "moveCardBetweenBlocks");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const sourceLoc = findBlockBody(editor, lineStart, lineEnd, source.label);
  const destLoc = findBlockBody(editor, lineStart, lineEnd, dest.label);
  if (!sourceLoc || !destLoc) {
    const missing = !sourceLoc ? source.label : dest.label;
    console.warn(`Vizardry: moveCardBetweenBlocks — block "${missing}" not found in lines ${lineStart}–${lineEnd}`);
    return false;
  }

  // Edit whichever block is lower in the file first, so applying that edit
  // can't shift the line numbers the other (still-pending) edit relies on.
  const edits = [
    { loc: sourceLoc, value: source.newContent },
    { loc: destLoc, value: dest.newContent },
  ].sort((a, b) => b.loc.blockHeaderLine - a.loc.blockHeaderLine);

  editorWrite(() => {
    for (const { loc, value } of edits) applyBlockEdit(editor, loc, value);
  }, el);
  return true;
}

/**
 * Adds or removes `collapsed: true` from the top of a canvas code fence.
 * Uses vault.process so it works in both Reading View and Live Preview —
 * the previous editor-based approach silently failed in Reading View because
 * there is no CM6 editor instance to write to in that mode.
 */
export async function writeCollapseState(
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
  collapsed: boolean,
): Promise<void> {
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) return;

  const source = container.dataset.vzSource;
  if (source === undefined) return;

  await app.vault.process(file, (content) => {
    const result = patchFenceCollapseState(content, source, collapsed);
    if (result === null) return content;
    // Keep vzSource in sync so future operations find the updated fence.
    container.dataset.vzSource = result.newSource;
    return result.newContent;
  });
}

/**
 * Finds the code fence in `fileContent` whose body matches `source` (trimmed),
 * then adds or removes a `collapsed: true` line at the top of the body.
 * Returns null when the fence is not found or is already in the target state.
 */
function patchFenceCollapseState(
  fileContent: string,
  source: string,
  collapsed: boolean,
): { newContent: string; newSource: string } | null {
  const normalised = source.trim();
  const lines = fileContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const openMatch = lines[i].trim().match(/^(`{3,})/);
    if (!openMatch) continue;
    const closeRe = new RegExp(`^\`{${openMatch[1].length},}\\s*$`);

    const fenceStart = i;
    const bodyLines: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (closeRe.test(lines[j].trim())) break;
      bodyLines.push(lines[j]);
    }

    if (bodyLines.join("\n").trim() === normalised) {
      const collapsedIdx = bodyLines.findIndex(
        l => l.trimStart().toLowerCase().startsWith("collapsed:")
      );
      const newBodyLines = [...bodyLines];
      if (collapsed && collapsedIdx === -1) {
        newBodyLines.splice(0, 0, "collapsed: true");
      } else if (!collapsed && collapsedIdx !== -1) {
        newBodyLines.splice(collapsedIdx, 1);
      } else {
        return null;
      }

      const newLines = [
        ...lines.slice(0, fenceStart + 1),
        ...newBodyLines,
        ...(j < lines.length ? [lines[j]] : []),
        ...lines.slice(j + 1),
      ];
      return { newContent: newLines.join("\n"), newSource: newBodyLines.join("\n") };
    }

    i = j;
  }

  console.warn("Vizardry: writeCollapseState — no matching code fence found");
  return null;
}
