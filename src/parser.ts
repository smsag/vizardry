import type { ParseResult } from "./types";

/**
 * Parses the `block: Label\n  content` syntax used by all grid frameworks.
 *
 * Syntax:
 *   block: Label
 *     Content line 1
 *     Content line 2
 *
 * Display-mode modifier (optional, appended after a pipe):
 *   block: Label | card     — render block content as draggable cards
 *   (any other modifier is silently ignored — plain bullet text is the
 *   standard rendering and there is no explicit way to force it back on)
 *
 * Canvas-wide option:
 *   cards: all   — render every block in the canvas as cards, overriding
 *                  any per-block modifier
 *
 * Rules:
 * - `block:` keyword followed by the block label (case-insensitive match at render time)
 * - Content is indented below the block line — no `|` scalar needed
 * - Lines starting with `//` are comments (ignored)
 * - Unknown block labels are stored but silently ignored at render time
 * - A block label declared twice is a parse error (would otherwise silently
 *   discard the first occurrence's content)
 * - Blank lines between blocks are ignored
 * - Heading links use inline [[#Heading]] annotations on block lines (see shared/links.ts)
 */
export function parseFrameworkSource(source: string): ParseResult {
  const data: Record<string, string> = {};
  const cardBlocks = new Set<string>();
  let allCards = false;
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("//")) {
      i++;
      continue;
    }

    const indent = raw.search(/\S/);

    if (indent > 0) {
      return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
    }

    if (trimmed.toLowerCase().startsWith("title:")) {
      i++;
      continue;
    }

    if (trimmed.toLowerCase().startsWith("cards:")) {
      const value = trimmed.slice("cards:".length).trim().toLowerCase();
      if (value !== "all") {
        return { ok: false, error: `Line ${i + 1}: Unknown value "${value}" for "cards:" — expected "all"` };
      }
      allCards = true;
      i++;
      continue;
    }

    if (trimmed.startsWith("block:")) {
      const rawLabel = trimmed.slice("block:".length).trim();
      if (!rawLabel) {
        return { ok: false, error: `Line ${i + 1}: "block:" requires a label` };
      }

      // Strip optional | card modifier (any other modifier is ignored)
      const pipeIdx = rawLabel.indexOf("|");
      const label = pipeIdx !== -1 ? rawLabel.slice(0, pipeIdx).trim() : rawLabel;
      if (pipeIdx !== -1) {
        const modifier = rawLabel.slice(pipeIdx + 1).trim().toLowerCase();
        if (modifier === "card") cardBlocks.add(label.toLowerCase());
      }

      const key = label.toLowerCase();
      if (key in data) {
        return { ok: false, error: `Line ${i + 1}: duplicate "block: ${label}" — a block with this label was already declared` };
      }
      const contentLines: string[] = [];
      i++;
      let blockIndent = -1;

      while (i < lines.length) {
        const blockRaw = lines[i];
        const blockTrimmed = blockRaw.trim();

        if (blockTrimmed === "" || blockTrimmed.startsWith("//")) {
          if (blockIndent !== -1) contentLines.push("");
          i++;
          continue;
        }

        const lineIndent = blockRaw.search(/\S/);
        if (lineIndent === 0) break; // back to root level
        if (blockIndent === -1) blockIndent = lineIndent;
        if (lineIndent < blockIndent) break;
        contentLines.push(blockRaw.slice(blockIndent));
        i++;
      }

      // Strip trailing blank lines
      while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
        contentLines.pop();
      }

      data[key] = contentLines.join("\n");

    } else {
      return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}". Use "block: Label"` };
    }
  }

  return { ok: true, data, links: {}, cardBlocks, allCards };
}
