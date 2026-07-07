import type { Editor } from "obsidian";

export type KeyedBlock = { blockLineStart: number; blockLineEnd: number };

/**
 * Locates the `index`-th (0-based) block whose header line matches
 * `isHeader` within [lineStart, lineEnd]. A block spans from its header line
 * to the line before the next matching header (or lineEnd, for the last one).
 * Returns null if there's no block at that index.
 */
export function findNthKeyedBlock(
  editor: Editor,
  lineStart: number,
  lineEnd: number,
  isHeader: (trimmedLower: string) => boolean,
  index: number,
): KeyedBlock | null {
  let count = -1;
  let blockLineStart = -1;
  let blockLineEnd = lineEnd;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim().toLowerCase();
    if (isHeader(trimmed)) {
      count++;
      if (count === index) {
        blockLineStart = ln;
      } else if (count > index) {
        blockLineEnd = ln - 1;
        break;
      }
    }
  }

  if (blockLineStart === -1) return null;
  return { blockLineStart, blockLineEnd };
}

/**
 * Finds the `key: value` line within a keyed block and either replaces its
 * value in place (preserving indent) or, if the key is absent, inserts a new
 * line for it after the block's last non-blank, non-comment line.
 */
export function writeKeyedSubLine(
  editor: Editor,
  block: KeyedBlock,
  key: string,
  newValue: string,
): void {
  const targetPrefix = `${key}:`;
  let cellLine = -1;

  for (let ln = block.blockLineStart + 1; ln <= block.blockLineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(targetPrefix)) {
      cellLine = ln;
      break;
    }
  }

  if (cellLine !== -1) {
    const raw = editor.getLine(cellLine);
    const indent = raw.match(/^(\s*)/)?.[1] ?? "  ";
    editor.replaceRange(
      `${indent}${key}: ${newValue}`,
      { line: cellLine, ch: 0 },
      { line: cellLine, ch: raw.length },
    );
  } else {
    let insertAfter = block.blockLineStart;
    for (let ln = block.blockLineStart + 1; ln <= block.blockLineEnd; ln++) {
      const t = editor.getLine(ln).trim();
      if (t && !t.startsWith("//")) insertAfter = ln;
    }
    const insertLineText = editor.getLine(insertAfter);
    editor.replaceRange(
      `\n  ${key}: ${newValue}`,
      { line: insertAfter, ch: insertLineText.length },
    );
  }
}
