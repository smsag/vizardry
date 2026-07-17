import type { NodeMapBox, NodeMapLink, NodeMapLinkDirection, NodeMapLineStyle, NodeMapColor, NodeMapResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const MAX_BOXES = 50;

const COLOR_NAMES = new Set(["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"]);
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type ColorResult = { ok: true; value: NodeMapColor } | { ok: false; error: string };

function parseColor(raw: string, lineNum: number): ColorResult {
  const value = raw.trim();
  if (COLOR_NAMES.has(value.toLowerCase())) return { ok: true, value: value.toLowerCase() as NodeMapColor };
  if (HEX_RE.test(value)) return { ok: true, value: value as NodeMapColor };
  return {
    ok: false,
    error: `Line ${lineNum}: unrecognised color "${value}" — expected a palette name (red, orange, yellow, green, teal, blue, purple, pink, gray) or a #hex value`,
  };
}

/**
 * Parses Node Map syntax:
 *
 *   box: <name> [x: <num>, y: <num>]
 *   box: <name> [x: <num>, y: <num>, color: <name|#hex>]
 *     <optional indented multi-line body>
 *
 *   link: <from> -> <to>              directed
 *   link: <from> <-> <to>             bidirectional
 *   link: <from> -- <to>              undirected
 *   link: <from> -> <to> : <label>
 *   link: <from> -> <to> [color: red, style: dashed]
 *
 * Box coordinates are the box's top-left corner, in unbounded (non-negative)
 * units — the canvas grows to fit its content, there is no fixed axis.
 */
export function parseNodeMap(source: string): NodeMapResult {
  const lines = source.split("\n");
  const boxes = new Map<string, NodeMapBox>();
  const boxLineNums = new Map<string, number>();
  const links: NodeMapLink[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    if (trimmed.startsWith("box:")) {
      const declLine = i + 1;
      const rest = trimmed.slice("box:".length).trim();
      const bracketMatch = rest.match(
        /^(.*?)\s*\[\s*x:\s*([+-]?[0-9]*\.?[0-9]+)\s*,\s*y:\s*([+-]?[0-9]*\.?[0-9]+)\s*(?:,\s*color:\s*([^\]]+?))?\s*\]\s*$/,
      );
      if (!bracketMatch) {
        return { ok: false, error: `Line ${declLine}: box requires coordinates, e.g. box: Name [x: 100, y: 50]` };
      }

      const name = bracketMatch[1].trim();
      if (!name) return { ok: false, error: `Line ${declLine}: box requires a name` };
      if (name.includes(":") || name.includes("[") || name.includes("]")) {
        return { ok: false, error: `Line ${declLine}: box name cannot contain ":" or brackets` };
      }

      const x = parseFloat(bracketMatch[2]);
      const y = parseFloat(bracketMatch[3]);
      if (Number.isNaN(x) || Number.isNaN(y)) {
        return { ok: false, error: `Line ${declLine}: box requires coordinates, e.g. box: Name [x: 100, y: 50]` };
      }
      if (x < 0 || y < 0) {
        return { ok: false, error: `Line ${declLine}: coordinates must be non-negative` };
      }

      let color: NodeMapColor | undefined;
      if (bracketMatch[4] !== undefined) {
        const parsed = parseColor(bracketMatch[4], declLine);
        if (!parsed.ok) return parsed;
        color = parsed.value;
      }

      const key = name.toLowerCase();
      if (boxes.has(key)) {
        return { ok: false, error: `Line ${declLine}: duplicate box "${name}" (already declared on line ${boxLineNums.get(key)})` };
      }

      // Consume indented continuation lines directly below as multi-line body text.
      const bodyLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const bodyRaw = lines[j];
        if (bodyRaw.trim() === "") break;
        if (bodyRaw.search(/\S/) === 0) break; // next top-level line — body block ended
        bodyLines.push(bodyRaw.trim());
      }
      i = j - 1;

      boxes.set(key, { name, x, y, color, body: bodyLines.length > 0 ? bodyLines.join("\n") : undefined });
      boxLineNums.set(key, declLine);
      continue;
    }

    if (trimmed.startsWith("link:")) {
      const lineNum = i + 1;
      const rest = trimmed.slice("link:".length).trim();

      // Longest/most-specific token first so "<->" isn't mistaken for "->".
      let direction: NodeMapLinkDirection;
      let tokenIdx: number;
      let tokenLen: number;
      const biIdx = rest.indexOf("<->");
      const dirIdx = rest.indexOf("->");
      const undirIdx = rest.indexOf("--");
      if (biIdx !== -1) { direction = "bidirectional"; tokenIdx = biIdx; tokenLen = 3; }
      else if (dirIdx !== -1) { direction = "directed"; tokenIdx = dirIdx; tokenLen = 2; }
      else if (undirIdx !== -1) { direction = "undirected"; tokenIdx = undirIdx; tokenLen = 2; }
      else {
        return { ok: false, error: `Line ${lineNum}: link requires "->", "<->", or "--"` };
      }

      const from = rest.slice(0, tokenIdx).trim();
      let tail = rest.slice(tokenIdx + tokenLen).trim();
      if (!from) return { ok: false, error: `Line ${lineNum}: link requires two box names` };

      // Strip trailing bracket modifiers before splitting off the label, so a
      // label containing "[" or "]" can't be confused with the modifier block.
      let color: NodeMapColor | undefined;
      let style: NodeMapLineStyle = "solid";
      const modMatch = tail.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
      if (modMatch) {
        tail = modMatch[1].trim();
        const parts = modMatch[2].split(",").map(p => p.trim()).filter(p => p.length > 0);
        for (const part of parts) {
          const kv = part.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
          if (!kv) return { ok: false, error: `Line ${lineNum}: malformed link modifier "${part}"` };
          const modKey = kv[1].toLowerCase();
          const modValue = kv[2].trim();
          if (modKey === "color") {
            const parsed = parseColor(modValue, lineNum);
            if (!parsed.ok) return parsed;
            color = parsed.value;
          } else if (modKey === "style") {
            if (modValue !== "solid" && modValue !== "dashed") {
              return { ok: false, error: `Line ${lineNum}: style must be "solid" or "dashed"` };
            }
            style = modValue;
          } else {
            return { ok: false, error: `Line ${lineNum}: unknown link modifier "${modKey}" — expected color or style` };
          }
        }
      }

      // Split the (now modifier-free) tail into "to" and an optional label.
      let to: string;
      let label: string | undefined;
      const labelIdx = tail.indexOf(" : ");
      if (labelIdx !== -1) {
        to = tail.slice(0, labelIdx).trim();
        label = tail.slice(labelIdx + 3).trim() || undefined;
      } else {
        to = tail.trim();
      }

      if (!to) return { ok: false, error: `Line ${lineNum}: link requires two box names` };
      if (from.toLowerCase() === to.toLowerCase()) {
        return { ok: false, error: `Line ${lineNum}: self-links are not allowed` };
      }

      links.push({ from, to, direction, label, color, style });
      continue;
    }

    return { ok: false, error: `Line ${i + 1}: unrecognised keyword — expected box or link` };
  }

  if (boxes.size === 0) {
    return { ok: false, error: "No boxes defined — add at least one, e.g. box: Name [x: 100, y: 50]" };
  }
  if (boxes.size > MAX_BOXES) {
    return { ok: false, error: `Node map has ${boxes.size} boxes — limit is ${MAX_BOXES}. Split into smaller maps.` };
  }

  for (const link of links) {
    const fromBox = boxes.get(link.from.toLowerCase());
    const toBox = boxes.get(link.to.toLowerCase());
    if (!fromBox) return { ok: false, error: `Link references unknown box "${link.from}"` };
    if (!toBox) return { ok: false, error: `Link references unknown box "${link.to}"` };
    // Normalise to the box's canonical declared name/casing.
    link.from = fromBox.name;
    link.to = toBox.name;
  }

  return { ok: true, data: { boxes: [...boxes.values()], links } };
}
