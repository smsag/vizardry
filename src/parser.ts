import { ParseResult } from "./types";

export function parseFrameworkSource(source: string): ParseResult {
  const data: Record<string, string> = {};
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const keyValueMatch = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)/);
    if (!keyValueMatch) {
      return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${line.trim()}"` };
    }

    const key = keyValueMatch[1];
    const rest = keyValueMatch[2].trim();

    if (rest === "|") {
      // Block scalar: collect indented lines that follow
      const blockLines: string[] = [];
      i++;
      // Determine indent from first non-empty line
      let indent = -1;
      while (i < lines.length) {
        const blockLine = lines[i];
        if (blockLine.trim() === "") {
          // Blank line inside block scalar is allowed
          blockLines.push("");
          i++;
          continue;
        }
        const lineIndent = blockLine.match(/^(\s+)/)?.[1].length ?? 0;
        if (indent === -1) {
          if (lineIndent === 0) break; // Back to root level
          indent = lineIndent;
        }
        if (lineIndent < indent) break;
        blockLines.push(blockLine.slice(indent));
        i++;
      }
      // Trim trailing blank lines
      while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim() === "") {
        blockLines.pop();
      }
      data[key] = blockLines.join("\n");
    } else {
      data[key] = rest;
      i++;
    }
  }

  return { ok: true, data };
}
