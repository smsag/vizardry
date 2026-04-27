import { ParseResult } from "./types";

export function parseFrameworkSource(source: string): ParseResult {
  const data: Record<string, string> = {};
  const links: Record<string, string> = {};
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

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

    if (key === "_links") {
      // Nested key-value pairs at any indent level follow
      i++;
      while (i < lines.length) {
        const nested = lines[i];
        if (nested.trim() === "" || nested.trim().startsWith("#")) { i++; continue; }
        if (nested.search(/\S/) === 0) break; // back to root level
        const nestedMatch = nested.trim().match(/^([a-z_][a-z0-9_]*):\s*(.*)/);
        if (!nestedMatch) {
          return { ok: false, error: `Line ${i + 1}: invalid _links entry — "${nested.trim()}"` };
        }
        links[nestedMatch[1]] = nestedMatch[2].trim();
        i++;
      }
    } else if (rest === "|") {
      // Block scalar: collect indented lines
      const blockLines: string[] = [];
      i++;
      let indent = -1;
      while (i < lines.length) {
        const blockLine = lines[i];
        if (blockLine.trim() === "") {
          blockLines.push("");
          i++;
          continue;
        }
        const lineIndent = blockLine.match(/^(\s+)/)?.[1].length ?? 0;
        if (indent === -1) {
          if (lineIndent === 0) break;
          indent = lineIndent;
        }
        if (lineIndent < indent) break;
        blockLines.push(blockLine.slice(indent));
        i++;
      }
      while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim() === "") {
        blockLines.pop();
      }
      data[key] = blockLines.join("\n");
    } else {
      data[key] = rest;
      i++;
    }
  }

  return { ok: true, data, links };
}
