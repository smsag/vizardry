import { ParseResult } from "./types";

/**
 * Parses the `block: Label\n  content` syntax used by all grid frameworks.
 *
 * Syntax:
 *   block: Label
 *     Content line 1
 *     Content line 2
 *
 *   _links:
 *     Label: Heading text in this document
 *
 * Rules:
 * - `block:` keyword followed by the block label (case-insensitive match at render time)
 * - Content is indented below the block line — no `|` scalar needed
 * - `_links:` section maps block labels to heading anchors
 * - Lines starting with `#` are comments (ignored)
 * - Unknown block labels are stored but silently ignored at render time
 * - Blank lines between blocks are ignored
 */
export function parseFrameworkSource(source: string): ParseResult {
  const data: Record<string, string> = {};
  const links: Record<string, string> = {};
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
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

        if (blockTrimmed === "" || blockTrimmed.startsWith("#")) {
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

    } else if (trimmed.startsWith("_links:")) {
      i++;
      while (i < lines.length) {
        const nested = lines[i];
        const nestedTrimmed = nested.trim();
        if (nestedTrimmed === "" || nestedTrimmed.startsWith("#")) { i++; continue; }
        if (nested.search(/\S/) === 0) break; // back to root level

        const colonIdx = nestedTrimmed.indexOf(":");
        if (colonIdx === -1) {
          return { ok: false, error: `Line ${i + 1}: invalid _links entry — "${nestedTrimmed}"` };
        }
        const linkLabel = nestedTrimmed.slice(0, colonIdx).trim().toLowerCase();
        const linkTarget = nestedTrimmed.slice(colonIdx + 1).trim();
        links[linkLabel] = linkTarget;
        i++;
      }

    } else {
      return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}". Use "block: Label"` };
    }
  }

  return { ok: true, data, links };
}
