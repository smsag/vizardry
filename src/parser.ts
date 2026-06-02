import type { ParseResult } from "./types";

/**
 * Parses the `block: Label\n  content` syntax used by all grid frameworks.
 *
 * Syntax:
 *   block: Label
 *     Content line 1
 *     Content line 2
 *
 * Rules:
 * - `block:` keyword followed by the block label (case-insensitive match at render time)
 * - Content is indented below the block line — no `|` scalar needed
 * - Lines starting with `//` are comments (ignored)
 * - Unknown block labels are stored but silently ignored at render time
 * - Blank lines between blocks are ignored
 * - Heading links use inline [[#Heading]] annotations on block lines (see shared/links.ts)
 */
export function parseFrameworkSource(source: string): ParseResult {
  const data: Record<string, string> = {};
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

    if (trimmed.startsWith("block:")) {
      const label = trimmed.slice("block:".length).trim();
      if (!label) {
        return { ok: false, error: `Line ${i + 1}: "block:" requires a label` };
      }
      const key = label.toLowerCase();
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

  return { ok: true, data, links: {} };
}
