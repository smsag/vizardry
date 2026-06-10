import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

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
): boolean {
  try {
    return _writePaceLayerCell(app, ctx, el, layerName, cellKey, newValue);
  } catch (err) {
    console.error("Vizardry: writePaceLayerCell — unexpected error", err);
    return false;
  }
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
): boolean {
  // Guard: if the canvas element has been detached (replaced by a re-render),
  // skip the write — the new render has a fresh ctx and will handle future edits.
  if (!el.isConnected) {
    console.warn("Vizardry PL write ✗ container detached");
    return false;
  }

  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry PL write ✗ getSectionInfo returned null");
    return false;
  }
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry PL write ✗ file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn("Vizardry PL write ✗ no live editor — open note in editing mode");
    return false;
  }

  const { lineStart } = info;
  const totalLines = editor.lineCount();

  // ── Locate `layer: <layerName>` ─────────────────────────────────────────────
  // Search past info.lineEnd intentionally: ctx may be stale because Obsidian
  // reuses the same container element across re-renders (el.isConnected stays
  // true) but getSectionInfo() returns the old lineEnd. Earlier writes that
  // insert lines push lower layers — especially Culture — past the stale lineEnd.
  const targetHeader = `layer: ${layerName.toLowerCase()}`;
  let layerHeaderLine = -1;

  for (let ln = lineStart; ln < totalLines; ln++) {
    const raw: string = editor.getLine(ln);
    if (raw.trim().toLowerCase() === targetHeader) {
      layerHeaderLine = ln;
      break;
    }
  }

  if (layerHeaderLine === -1) {
    console.warn(`Vizardry PL write ✗ layer "${layerName}" not found (searched lines ${lineStart}–${totalLines - 1})`);
    return false;
  }
  // ── Determine layer body end ─────────────────────────────────────────────────
  // Scan forward from the layer header. Stop only at LEGITIMATE zero-indent
  // boundary lines: layer:/type:/context: headers and closing code fences.
  // Orphaned zero-indent fragments (plain text left behind by a previous bad
  // multi-line write) are treated as body content so the sub-key search and
  // replacement range can reach past them and clean them up.
  let layerBodyEnd = layerHeaderLine;
  for (let ln = layerHeaderLine + 1; ln < totalLines; ln++) {
    const raw: string = editor.getLine(ln);
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
  // ── Find the sub-key line ────────────────────────────────────────────────────
  const targetPrefix = `${cellKey.toLowerCase()}:`;
  let cellLine = -1;

  for (let ln = layerHeaderLine + 1; ln <= layerBodyEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(targetPrefix)) {
      cellLine = ln;
      break;
    }
  }
  // ── Build the replacement text with proper indentation ───────────────────────
  // Split the new value on newlines and indent every continuation line so the
  // parser can round-trip it. This also prevents the zero-indent-orphan
  // corruption that triggered this bug.
  const buildFormatted = (indent: string): string => {
    const lines = newValue.split("\n");
    return [
      `${indent}${cellKey}: ${lines[0] ?? ""}`,
      ...lines.slice(1).map(l => `${indent}${l}`),
    ].join("\n");
  };

  if (cellLine !== -1) {
    // ── Replace path ────────────────────────────────────────────────────────────
    const raw: string = editor.getLine(cellLine);
    const indent = raw.match(/^(\s*)/)?.[1] ?? "  ";

    // Find the last line that belongs to this value: indented continuations and
    // orphaned zero-indent fragments that were left by a previous bad write.
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

    const lastRaw: string = editor.getLine(lastValueLine);
    const formatted = buildFormatted(indent);
    editor.replaceRange(
      formatted,
      { line: cellLine,      ch: 0 },
      { line: lastValueLine, ch: lastRaw.length },
    );
  } else {
    // ── Insert path ─────────────────────────────────────────────────────────────
    // Key absent — insert after the last non-blank, non-comment line in the body
    let insertAfter = layerHeaderLine;
    for (let ln = layerHeaderLine + 1; ln <= layerBodyEnd; ln++) {
      const t = editor.getLine(ln).trim();
      if (t && !t.startsWith("//")) insertAfter = ln;
    }
    const insertLineText: string = editor.getLine(insertAfter);
    const formatted = "\n" + buildFormatted("  ");
    editor.replaceRange(
      formatted,
      { line: insertAfter, ch: insertLineText.length },
    );
  }

  return true;
}
