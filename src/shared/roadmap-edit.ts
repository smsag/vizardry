import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

function resolveEditor(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  caller: string,
): { editor: MarkdownView["editor"]; lineStart: number; lineEnd: number } | null {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn(`Vizardry: ${caller} — no section info`);
    return null;
  }
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: ${caller} — file not found: ${ctx.sourcePath}`);
    return null;
  }
  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath,
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn(`Vizardry: ${caller} — no live editor`);
    return null;
  }
  return { editor, lineStart: info.lineStart, lineEnd: info.lineEnd };
}

interface ItemRef {
  titleLine: number;
  subtitleLine: number; // -1 if no subtitle
  title: string;
}

interface ColBlock {
  headerLine: number;
  items: ItemRef[];
  indent: number; // indent of "item:" lines
}

function parseColBlocks(
  editor: { getLine: (n: number) => string },
  lineStart: number,
  lineEnd: number,
): Map<string, ColBlock> {
  const result = new Map<string, ColBlock>();
  let current: ColBlock | null = null;
  let currentColId: string | null = null;
  let blockIndent = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("title:")) continue;
    const indent = raw.search(/\S/);

    if (indent === 0) {
      const lower = trimmed.toLowerCase();
      if (lower === "now:" || lower === "next:" || lower === "later:") {
        currentColId = lower.slice(0, -1);
        current = { headerLine: ln, items: [], indent: -1 };
        result.set(currentColId, current);
        blockIndent = -1;
      } else {
        current = null;
        currentColId = null;
        blockIndent = -1;
      }
      continue;
    }

    if (!current) continue;

    if (blockIndent === -1) blockIndent = indent;
    if (current.indent === -1) current.indent = blockIndent;

    if (indent === blockIndent && trimmed.toLowerCase().startsWith("item:")) {
      const title = trimmed.slice("item:".length).trim();
      current.items.push({ titleLine: ln, subtitleLine: -1, title });
    } else if (indent > blockIndent && current.items.length > 0) {
      const lastItem = current.items[current.items.length - 1];
      if (trimmed.toLowerCase().startsWith("subtitle:")) {
        lastItem.subtitleLine = ln;
      }
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
    ? Math.max(...block.items.map(i => i.subtitleLine !== -1 ? i.subtitleLine : i.titleLine))
    : block.headerLine;
  const afterText = editor.getLine(insertAfterLine);
  editor.replaceRange(
    `\n${indentStr}item: ${unique}`,
    { line: insertAfterLine, ch: afterText.length },
  );
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
  const indentStr = " ".repeat(raw.search(/\S/));
  editor.replaceRange(
    `${indentStr}item: ${newTitle.trim()}`,
    { line: item.titleLine, ch: 0 },
    { line: item.titleLine, ch: raw.length },
  );
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

  // Collect the lines to move (title + optional subtitle)
  const linesToMove: string[] = [editor.getLine(item.titleLine)];
  if (item.subtitleLine !== -1) linesToMove.push(editor.getLine(item.subtitleLine));

  // Re-indent for target column
  const targetIndent = toBlock.indent !== -1 ? " ".repeat(toBlock.indent) : "  ";
  const movedLines = linesToMove.map(l => `${targetIndent}${l.trim()}`);

  // Determine insertion point in target column (after same-column move adjustments)
  let actualToIndex = fromColId === toColId
    ? (fromIndex < toIndex ? toIndex : toIndex)
    : toIndex;
  if (fromColId === toColId && fromIndex < toIndex) actualToIndex = toIndex;

  const targetItems = fromColId === toColId
    ? fromBlock.items.filter((_, i) => i !== fromIndex)
    : toBlock.items;

  let insertAfterLine: number;
  if (actualToIndex <= 0 || targetItems.length === 0) {
    insertAfterLine = toBlock.headerLine;
  } else {
    const refIdx = Math.min(actualToIndex - 1, targetItems.length - 1);
    const refItem = targetItems[refIdx];
    insertAfterLine = refItem.subtitleLine !== -1 ? refItem.subtitleLine : refItem.titleLine;
  }

  // For same-column reorder, insertAfterLine might be < or > item lines
  // Collect edits and apply bottom-up
  type Edit =
    | { kind: "delete"; line: number }
    | { kind: "insert"; afterLine: number; text: string };
  const edits: Edit[] = [];

  // Delete source lines (bottom-up within item)
  if (item.subtitleLine !== -1) edits.push({ kind: "delete", line: item.subtitleLine });
  edits.push({ kind: "delete", line: item.titleLine });

  edits.push({ kind: "insert", afterLine: insertAfterLine, text: movedLines.join("\n") });

  // Apply: sort so higher lines come first, insertions before deletions on same line
  const sortedEdits = [...edits].sort((a, b) => {
    const lineA = a.kind === "delete" ? a.line : a.afterLine;
    const lineB = b.kind === "delete" ? b.line : b.afterLine;
    if (lineB !== lineA) return lineB - lineA;
    // same line: insert before delete
    if (a.kind === "insert" && b.kind === "delete") return -1;
    if (a.kind === "delete" && b.kind === "insert") return 1;
    return 0;
  });

  for (const edit of sortedEdits) {
    if (edit.kind === "delete") {
      editor.replaceRange("", { line: edit.line, ch: 0 }, { line: edit.line + 1, ch: 0 });
    } else {
      const afterText = editor.getLine(edit.afterLine);
      editor.replaceRange(
        `\n${edit.text}`,
        { line: edit.afterLine, ch: afterText.length },
      );
    }
  }

  return true;
}
