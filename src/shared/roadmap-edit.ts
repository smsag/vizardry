import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";

/** Escapes a string for safe use inside a RegExp. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ItemRef {
  titleLine: number;
  /** Full title (without pipe or subtitle). */
  title: string;
}

interface ColBlock {
  headerLine: number;
  items: ItemRef[];
  indent: number; // indent of "item:" lines
}

/**
 * Parses column blocks from the editor source, extracting item title lines.
 * Items use the pipe convention: `item: <title> | <optional-key>`.
 * `title` contains only the part before `|`.
 */
function parseColBlocks(
  editor: { getLine: (n: number) => string },
  lineStart: number,
  lineEnd: number,
): Map<string, ColBlock> {
  const result = new Map<string, ColBlock>();
  let current: ColBlock | null = null;
  let blockIndent = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("title:")) continue;
    const indent = raw.search(/\S/);

    if (indent === 0) {
      const lower = trimmed.toLowerCase();
      if (lower === "now:" || lower === "next:" || lower === "later:") {
        const colId = lower.slice(0, -1);
        current = { headerLine: ln, items: [], indent: -1 };
        result.set(colId, current);
        blockIndent = -1;
      } else {
        current = null;
        blockIndent = -1;
      }
      continue;
    }

    if (!current) continue;
    if (blockIndent === -1) blockIndent = indent;
    if (current.indent === -1) current.indent = blockIndent;

    if (indent === blockIndent && trimmed.toLowerCase().startsWith("item:")) {
      const rest = trimmed.slice("item:".length);
      const pipeIdx = rest.indexOf("|");
      const title = pipeIdx === -1 ? rest.trim() : rest.slice(0, pipeIdx).trim();
      current.items.push({ titleLine: ln, title });
    }
  }

  return result;
}

export function addRoadmapItem(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  colId: string,
  itemTitle: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "addRoadmapItem");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const blocks = parseColBlocks(editor, lineStart, lineEnd);
  const block = blocks.get(colId);
  if (!block) {
    console.warn(`Vizardry: addRoadmapItem — column "${colId}" not found`);
    return false;
  }

  // Deduplicate title
  const existing = new Set(block.items.map(i => i.title.toLowerCase()));
  let unique = itemTitle.trim() || "New Item";
  if (existing.has(unique.toLowerCase())) {
    let idx = 2;
    while (existing.has(`${unique} ${idx}`.toLowerCase())) idx++;
    unique = `${unique} ${idx}`;
  }

  const indentStr = block.indent !== -1 ? " ".repeat(block.indent) : "  ";
  const insertAfterLine = block.items.length > 0
    ? block.items[block.items.length - 1].titleLine
    : block.headerLine;
  const afterText = editor.getLine(insertAfterLine);
  editorWrite(() => editor.replaceRange(
    `\n${indentStr}item: ${unique}`,
    { line: insertAfterLine, ch: afterText.length },
  ), el);
  return true;
}

export function renameRoadmapItem(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  colId: string,
  oldTitle: string,
  newTitle: string,
): boolean {
  if (!newTitle.trim() || newTitle === oldTitle) return false;

  const resolved = resolveEditor(app, ctx, el, "renameRoadmapItem");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const blocks = parseColBlocks(editor, lineStart, lineEnd);
  const block = blocks.get(colId);
  if (!block) return false;

  const item = block.items.find(i => i.title === oldTitle);
  if (!item) {
    console.warn(`Vizardry: renameRoadmapItem — item "${oldTitle}" not found in column "${colId}"`);
    return false;
  }

  const raw = editor.getLine(item.titleLine);
  // Regex matches `item: <oldTitle>` and preserves any trailing ` | <key>` suffix.
  const re = new RegExp(`^(\\s*item:\\s*)${escRe(oldTitle)}(\\s*(?:\\|.*)?$)`, "i");
  const newLine = raw.replace(re, `$1${newTitle.trim()}$2`);
  editorWrite(() => editor.replaceRange(newLine, { line: item.titleLine, ch: 0 }, { line: item.titleLine, ch: raw.length }), el);
  return true;
}

export function moveRoadmapItem(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  fromColId: string,
  fromIndex: number,
  toColId: string,
  toIndex: number,
): boolean {
  if (fromColId === toColId && fromIndex === toIndex) return true;

  const resolved = resolveEditor(app, ctx, el, "moveRoadmapItem");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const blocks = parseColBlocks(editor, lineStart, lineEnd);
  const fromBlock = blocks.get(fromColId);
  const toBlock = blocks.get(toColId);

  if (!fromBlock || !toBlock) return false;
  if (fromIndex < 0 || fromIndex >= fromBlock.items.length) return false;

  const item = fromBlock.items[fromIndex];
  const rawLine = editor.getLine(item.titleLine);

  // Re-indent for target column
  const targetIndent = toBlock.indent !== -1 ? " ".repeat(toBlock.indent) : "  ";
  const movedLine = `${targetIndent}${rawLine.trim()}`;

  // Determine insertion point in target column
  const targetItems = fromColId === toColId
    ? fromBlock.items.filter((_, i) => i !== fromIndex)
    : toBlock.items;

  // toIndex is already relative to the post-removal list: the dragged card is
  // hidden while dragging, so the UI computes drop-target indices against the
  // same (fromIndex-excluded) list as `targetItems` above — no adjustment needed.
  const actualToIndex = toIndex;

  let insertAfterLine: number;
  if (actualToIndex <= 0 || targetItems.length === 0) {
    insertAfterLine = toBlock.headerLine;
  } else {
    const refIdx = Math.min(actualToIndex - 1, targetItems.length - 1);
    insertAfterLine = targetItems[refIdx].titleLine;
  }

  editorWrite(() => {
    // Apply edits bottom-up to preserve line numbers
    if (item.titleLine > insertAfterLine) {
      // Delete first (higher line), then insert (lower line)
      editor.replaceRange("", { line: item.titleLine, ch: 0 }, { line: item.titleLine + 1, ch: 0 });
      const afterText = editor.getLine(insertAfterLine);
      editor.replaceRange(`\n${movedLine}`, { line: insertAfterLine, ch: afterText.length });
    } else {
      // Insert first (lower line), then delete (higher line — now shifted +1)
      const afterText = editor.getLine(insertAfterLine);
      editor.replaceRange(`\n${movedLine}`, { line: insertAfterLine, ch: afterText.length });
      editor.replaceRange("", { line: item.titleLine, ch: 0 }, { line: item.titleLine + 1, ch: 0 });
    }
  }, el);

  return true;
}
