import type { Heat, PlotAxis, PlotAxisTick, PlotData, PlotItem, PlotZone, Result } from "./types";

/**
 * Parses the `layout: plot` body of a matrix canvas — a continuous scatter on
 * two axes. Distinct from the grid parser: items carry (x, y) coordinates in
 * [0, 1] (origin bottom-left), axes carry any number of tick labels, and heat
 * is author-declared via zones rather than derived from cell position.
 *
 * Syntax (the caller has already blanked the type:/layout: lines):
 *
 *   x-axis: Effort | Low | High           # inline: evenly-spaced ticks
 *   y-axis: Impact                         # or a following indented tick list:
 *     0.0 | None
 *     1.0 | Huge
 *
 *   zone: rect 0,0.5 0.5,1 | Quick wins | heat: very-high
 *   zone: top-left | Leap of faith | heat: high
 *
 *   item: Fix checkout | x: 0.15, y: 0.9
 *     Optional card body line
 *
 * Every line's own indentation is significant only for axis tick lists and item
 * bodies; those are consumed by their header's sub-loop.
 */

const QUADRANT_RECTS: Record<string, [number, number, number, number]> = {
  "top-left":     [0, 0.5, 0.5, 1],
  "top-right":    [0.5, 0.5, 1, 1],
  "bottom-left":  [0, 0, 0.5, 0.5],
  "bottom-right": [0.5, 0, 1, 0.5],
};

const HEAT_LEVELS: readonly Heat[] = ["very-high", "high", "medium", "low"];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function isIndented(raw: string): boolean {
  return /^[ \t]/.test(raw) && raw.trim() !== "";
}

/** Parses `Title | a | b | c` (evenly-spaced ticks) or, if no inline ticks are
 *  given, reads the following indented `pos | label` lines. Advances `i`. */
function parseAxis(
  lines: string[],
  headerIdx: number,
  keyword: "x-axis:" | "y-axis:",
): { axis: PlotAxis; nextIdx: number } | { error: string } {
  const header = lines[headerIdx].trim();
  const value = header.slice(keyword.length).trim();
  const parts = value.split("|").map(s => s.trim());
  const title = parts[0] ?? "";
  if (!title) return { error: `Line ${headerIdx + 1}: "${keyword}" requires a title` };

  const inlineLabels = parts.slice(1).filter(s => s !== "");
  const ticks: PlotAxisTick[] = [];

  if (inlineLabels.length > 0) {
    inlineLabels.forEach((label, idx) => {
      const pos = inlineLabels.length === 1 ? 0.5 : idx / (inlineLabels.length - 1);
      ticks.push({ pos, label });
    });
    return { axis: { title, ticks }, nextIdx: headerIdx + 1 };
  }

  // No inline ticks — consume the following indented `pos | label` lines.
  let i = headerIdx + 1;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "" || raw.trim().startsWith("//")) continue;
    if (!isIndented(raw)) break;
    const [posStr, ...labelParts] = raw.trim().split("|");
    const pos = Number(posStr.trim());
    const label = labelParts.join("|").trim();
    if (!Number.isFinite(pos)) return { error: `Line ${i + 1}: axis tick needs a numeric position — "${raw.trim()}"` };
    if (!label) return { error: `Line ${i + 1}: axis tick needs a label after "|" — "${raw.trim()}"` };
    ticks.push({ pos: clamp01(pos), label });
  }
  return { axis: { title, ticks }, nextIdx: i };
}

function parseZone(line: string, lineNo: number): PlotZone | { error: string } {
  const value = line.trim().slice("zone:".length).trim();
  const segments = value.split("|").map(s => s.trim());
  const shape = segments[0] ?? "";

  let rect: [number, number, number, number] | null = null;
  if (shape.toLowerCase().startsWith("rect")) {
    // rect x0,y0 x1,y1
    const nums = shape.slice(4).trim().split(/[\s,]+/).map(Number);
    if (nums.length !== 4 || nums.some(n => !Number.isFinite(n))) {
      return { error: `Line ${lineNo}: zone rect needs four numbers "x0,y0 x1,y1" — "${shape}"` };
    }
    rect = [clamp01(nums[0]), clamp01(nums[1]), clamp01(nums[2]), clamp01(nums[3])];
  } else if (shape.toLowerCase() in QUADRANT_RECTS) {
    rect = QUADRANT_RECTS[shape.toLowerCase()];
  } else {
    return { error: `Line ${lineNo}: unknown zone shape "${shape}" — use "rect x0,y0 x1,y1" or a quadrant (top-left…)` };
  }

  const zone: PlotZone = { rect };
  for (const seg of segments.slice(1)) {
    const lower = seg.toLowerCase();
    if (lower.startsWith("heat:")) {
      const level = lower.slice("heat:".length).trim() as Heat;
      if (!HEAT_LEVELS.includes(level)) {
        return { error: `Line ${lineNo}: unknown heat "${seg}" — expected very-high, high, medium, or low` };
      }
      zone.heat = level;
    } else if (seg) {
      zone.label = seg;
    }
  }
  return zone;
}

/** Parses an `item: Label | x: .., y: ..` header plus its indented body. */
function parseItem(
  lines: string[],
  headerIdx: number,
): { item: PlotItem; nextIdx: number } | { error: string } {
  const header = lines[headerIdx].trim();
  const value = header.slice("item:".length).trim();
  const pipeIdx = value.indexOf("|");
  const label = (pipeIdx !== -1 ? value.slice(0, pipeIdx) : value).trim();
  if (!label) return { error: `Line ${headerIdx + 1}: "item:" requires a label` };

  const modifier = pipeIdx !== -1 ? value.slice(pipeIdx + 1) : "";
  const xMatch = modifier.match(/x\s*:\s*(-?\d*\.?\d+)/i);
  const yMatch = modifier.match(/y\s*:\s*(-?\d*\.?\d+)/i);
  if (!xMatch || !yMatch) {
    return { error: `Line ${headerIdx + 1}: item "${label}" needs coordinates, e.g. "| x: 0.2, y: 0.8"` };
  }
  const x = clamp01(Number(xMatch[1]));
  const y = clamp01(Number(yMatch[1]));

  // Consume indented body lines.
  const bodyLines: string[] = [];
  let i = headerIdx + 1;
  let bodyIndent = -1;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "" || raw.trim().startsWith("//")) {
      if (bodyIndent !== -1) bodyLines.push("");
      continue;
    }
    const indent = raw.search(/\S/);
    if (indent <= 0) break;
    if (bodyIndent === -1) bodyIndent = indent;
    if (indent < bodyIndent) break;
    bodyLines.push(raw.slice(bodyIndent));
  }
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();

  return { item: { label, content: bodyLines.join("\n"), x, y }, nextIdx: i };
}

export function parsePlot(source: string): Result<PlotData> {
  const lines = source.split("\n");
  let xAxis: PlotAxis | null = null;
  let yAxis: PlotAxis | null = null;
  const items: PlotItem[] = [];
  const zones: PlotZone[] = [];
  const seenLabels = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (trimmed === "" || trimmed.startsWith("//")) { i++; continue; }
    // Config lines handled elsewhere (title/collapsed) or already blanked (type/layout).
    if (lower.startsWith("title:") || lower.startsWith("collapsed:") || lower.startsWith("type:") || lower.startsWith("layout:")) { i++; continue; }

    if (isIndented(raw)) {
      return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
    }

    if (lower.startsWith("x-axis:") || lower.startsWith("y-axis:")) {
      const kw = lower.startsWith("x-axis:") ? "x-axis:" : "y-axis:";
      const res = parseAxis(lines, i, kw);
      if ("error" in res) return { ok: false, error: res.error };
      if (kw === "x-axis:") xAxis = res.axis; else yAxis = res.axis;
      i = res.nextIdx;
      continue;
    }

    if (lower.startsWith("zone:")) {
      const res = parseZone(trimmed, i + 1);
      if ("error" in res) return { ok: false, error: res.error };
      zones.push(res);
      i++;
      continue;
    }

    if (lower.startsWith("item:")) {
      const res = parseItem(lines, i);
      if ("error" in res) return { ok: false, error: res.error };
      const key = res.item.label.toLowerCase();
      if (seenLabels.has(key)) {
        return { ok: false, error: `Line ${i + 1}: duplicate "item: ${res.item.label}" — labels must be unique so edits target the right one` };
      }
      seenLabels.add(key);
      items.push(res.item);
      i = res.nextIdx;
      continue;
    }

    return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}". Use "x-axis:", "y-axis:", "zone:", or "item:"` };
  }

  if (!xAxis || !yAxis) {
    return { ok: false, error: `A plotted matrix needs both "x-axis:" and "y-axis:" lines` };
  }

  return { ok: true, data: { xAxis, yAxis, items, zones } };
}
