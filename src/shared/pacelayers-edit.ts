import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { LAYER_LABELS } from "../pacelayers";
import type { PaceLayerName, PaceLayerType } from "../types";

/**
 * Returns true if a zero-indent line is an "orphaned value fragment" —
 * plain text left behind by a previous bad multi-line write — rather than
 * a legitimate YAML structure element.
 *
 * Legitimate zero-indent lines: layer:/type:/context: headers, sub-keys
 * (obs:/feed:/idea:/note:), closing code fences, and comment lines (//).
 * Anything else is treated as a stray continuation that should be included
 * in the current value's range and overwritten.
 */
function isOrphanedFragment(raw: string): boolean {
  const t = raw.trim();
  return (
    t !== "" &&
    !raw.startsWith(" ") &&
    !raw.startsWith("\t") &&
    !/^(layer|type|context|obs|feed|idea|note):/i.test(t) &&
    !t.startsWith("`") &&
    !t.startsWith("//")
  );
}

/**
 * Public entry-point — wraps the real implementation in a try/catch so any
 * unexpected runtime error surfaces in the Obsidian console rather than
 * silently swallowing the failure.
 */
export function writePaceLayerCell(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  layerName: string,
  cellKey: string,
  newValue: string,
  type?: PaceLayerType,
): boolean {
  try {
    return _writePaceLayerCell(app, ctx, el, layerName, cellKey, newValue, type);
  } catch (err) {
    console.error("Vizardry: writePaceLayerCell — unexpected error", err);
    return false;
  }
}

/**
 * Finds the `layer: <layerName>` header line, accepting either the
 * canonical name or the type-specific display alias (the rendered canvas
 * only ever shows the alias, e.g. `layer: Experiments` under type: product
 * for the canonical "Fashion" layer).
 *
 * Searches past `lineEnd` intentionally: ctx may be stale because Obsidian
 * reuses the same container element across re-renders (el.isConnected stays
 * true) but getSectionInfo() returns the old lineEnd. Earlier writes that
 * insert lines push lower layers — especially Culture — past the stale
 * lineEnd. Returns -1 if not found.
 */
function findLayerHeader(
  editor: Editor,
  lineStart: number,
  totalLines: number,
  layerName: string,
  type: PaceLayerType | undefined,
): number {
  const acceptedHeaders = new Set([`layer: ${layerName.toLowerCase()}`]);
  if (type) {
    const alias = LAYER_LABELS[type][layerName as PaceLayerName];
    if (alias) acceptedHeaders.add(`layer: ${alias.toLowerCase()}`);
  }

  for (let ln = lineStart; ln < totalLines; ln++) {
    const raw = editor.getLine(ln);
    if (acceptedHeaders.has(raw.trim().toLowerCase())) return ln;
  }
  return -1;
}

/**
 * Scans forward from the layer header to find the end of its body. Stops
 * only at LEGITIMATE zero-indent boundary lines: layer:/type:/context:
 * headers and closing code fences. Orphaned zero-indent fragments (plain
 * text left behind by a previous bad multi-line write) are treated as body
 * content so the sub-key search and replacement range can reach past them
 * and clean them up.
 */
function findLayerBodyEnd(editor: Editor, layerHeaderLine: number, totalLines: number): number {
  let layerBodyEnd = layerHeaderLine;
  for (let ln = layerHeaderLine + 1; ln < totalLines; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    if (trimmed === "") {
      // Blank line — keep scanning (may separate sub-keys)
      layerBodyEnd = ln;
      continue;
    }

    if (raw.startsWith(" ") || raw.startsWith("\t")) {
      // Indented — normal sub-key or continuation line
      layerBodyEnd = ln;
      continue;
    }

    // Zero-indent non-blank: is it a legitimate block boundary?
    if (/^(layer|type|context):/i.test(trimmed) || trimmed.startsWith("`")) {
      break; // Real boundary — stop here
    }

    // Orphaned zero-indent fragment — include it and keep scanning so the
    // sub-key search can see past it and the replace range covers it.
    layerBodyEnd = ln;
  }
  return layerBodyEnd;
}

/** Finds the `<cellKey>: value` sub-key line within [layerHeaderLine+1, layerBodyEnd]. Returns -1 if absent. */
function findCellLine(editor: Editor, layerHeaderLine: number, layerBodyEnd: number, cellKey: string): number {
  const targetPrefix = `${cellKey.toLowerCase()}:`;
  for (let ln = layerHeaderLine + 1; ln <= layerBodyEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(targetPrefix)) return ln;
  }
  return -1;
}

/**
 * Finds the last line belonging to an existing cell's value: indented
 * continuation lines, plus any orphaned zero-indent fragments left by a
 * previous bad write (included so the replace range overwrites them too).
 */
function findLastValueLine(editor: Editor, cellLine: number, layerBodyEnd: number): number {
  let lastValueLine = cellLine;
  for (let ln = cellLine + 1; ln <= layerBodyEnd; ln++) {
    const nextRaw = editor.getLine(ln);
    const nextTrimmed = nextRaw.trim();

    if (nextTrimmed === "") break; // Blank line ends the value

    // Indented line that is not the start of another sub-key
    if (
      (nextRaw.startsWith(" ") || nextRaw.startsWith("\t")) &&
      !/^(obs|feed|idea|note):/i.test(nextTrimmed)
    ) {
      lastValueLine = ln;
      continue;
    }

    // Orphaned zero-indent fragment — include so we overwrite it
    if (isOrphanedFragment(nextRaw)) {
      lastValueLine = ln;
      continue;
    }

    break;
  }
  return lastValueLine;
}

/** Finds the last non-blank, non-comment line in the layer body to insert a new sub-key after. */
function findInsertionLine(editor: Editor, layerHeaderLine: number, layerBodyEnd: number): number {
  let insertAfter = layerHeaderLine;
  for (let ln = layerHeaderLine + 1; ln <= layerBodyEnd; ln++) {
    const t = editor.getLine(ln).trim();
    if (t && !t.startsWith("//")) insertAfter = ln;
  }
  return insertAfter;
}

/**
 * Splits a (possibly multi-line) value on newlines and indents every
 * continuation line so the parser can round-trip it. This also prevents the
 * zero-indent-orphan corruption that motivated isOrphanedFragment() above.
 */
function buildFormattedValue(cellKey: string, newValue: string, indent: string): string {
  const lines = newValue.split("\n");
  return [
    `${indent}${cellKey}: ${lines[0] ?? ""}`,
    ...lines.slice(1).map(l => `${indent}${l}`),
  ].join("\n");
}

/**
 * Writes an updated cell value back into the source code block for a
 * pace-layers canvas.
 *
 * Locates `layer: <layerName>` within the code block, then either replaces
 * the existing `<cellKey>: value` line (plus any continuation lines) or
 * inserts one if the key was absent.
 *
 * Multi-line values are stored with properly-indented continuation lines so
 * the parser can round-trip them. Any orphaned zero-indent fragments left by
 * a previous bad multi-line write are detected and cleaned up.
 *
 * Returns false if the editor is unavailable (Reading View) or the layer
 * cannot be located.
 */
function _writePaceLayerCell(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  layerName: string,
  cellKey: string,
  newValue: string,
  type?: PaceLayerType,
): boolean {
  // Guard: if the canvas element has been detached (replaced by a re-render),
  // skip the write — the new render has a fresh ctx and will handle future edits.
  if (!el.isConnected) {
    console.warn("Vizardry PL write ✗ container detached");
    return false;
  }

  const resolved = resolveEditor(app, ctx, el, "_writePaceLayerCell");
  if (!resolved) return false;
  const { editor, lineStart } = resolved;
  const totalLines = editor.lineCount();

  const layerHeaderLine = findLayerHeader(editor, lineStart, totalLines, layerName, type);
  if (layerHeaderLine === -1) {
    console.warn(`Vizardry PL write ✗ layer "${layerName}" not found (searched lines ${lineStart}–${totalLines - 1})`);
    return false;
  }

  const layerBodyEnd = findLayerBodyEnd(editor, layerHeaderLine, totalLines);
  const cellLine = findCellLine(editor, layerHeaderLine, layerBodyEnd, cellKey);

  if (cellLine !== -1) {
    // ── Replace path ────────────────────────────────────────────────────────────
    const raw = editor.getLine(cellLine);
    // /^(\s*)/ always matches (possibly zero characters), so this is never null.
    const indent = raw.match(/^(\s*)/)![1];

    const lastValueLine = findLastValueLine(editor, cellLine, layerBodyEnd);
    const lastRaw = editor.getLine(lastValueLine);
    const formatted = buildFormattedValue(cellKey, newValue, indent);
    editor.replaceRange(
      formatted,
      { line: cellLine,      ch: 0 },
      { line: lastValueLine, ch: lastRaw.length },
    );
  } else {
    // ── Insert path ─────────────────────────────────────────────────────────────
    const insertAfter = findInsertionLine(editor, layerHeaderLine, layerBodyEnd);
    const insertLineText = editor.getLine(insertAfter);
    const formatted = "\n" + buildFormattedValue(cellKey, newValue, "  ");
    editor.replaceRange(
      formatted,
      { line: insertAfter, ch: insertLineText.length },
    );
  }

  return true;
}
