import type { Heat, MatrixAxis, MatrixData, MatrixItem, MatrixPreset, MatrixResult } from "./types";
import { PRESETS, resolveCells } from "./matrix-presets";

const HEAT_LEVELS: readonly Heat[] = ["very-high", "high", "medium", "low"];
const PRESET_NAMES: readonly MatrixPreset[] = ["pain", "opportunity", "impact", "assumption", "scenario"];

function resolvePreset(value: string | undefined): MatrixPreset | null | { error: string } {
  if (value === undefined || value.trim() === "") return null;
  const v = value.trim().toLowerCase();
  if ((PRESET_NAMES as readonly string[]).includes(v)) return v as MatrixPreset;
  return { error: `Unknown preset "${v}" — expected ${PRESET_NAMES.map(p => `"${p}"`).join(", ")}, or none` };
}

function parseAxis(value: string): MatrixAxis {
  const parts = value.split("|").map(s => s.trim());
  const title = parts[0] ?? "";
  const ticks = parts.slice(1).filter(s => s !== "");
  return { title, ticks };
}

function isHeat(s: string): s is Heat {
  return (HEAT_LEVELS as readonly string[]).includes(s.toLowerCase());
}

/** Parses a `tN: Name | heat` cell override line into {id, name?, heat?}. */
function parseCell(line: string): { id: string; name?: string; heat?: Heat } {
  const colon = line.indexOf(":");
  const id = line.slice(0, colon).trim().toLowerCase();
  const rest = line.slice(colon + 1);
  const parts = rest.split("|").map(s => s.trim()).filter(s => s !== "");
  const out: { id: string; name?: string; heat?: Heat } = { id };
  for (const part of parts) {
    if (isHeat(part)) out.heat = part.toLowerCase() as Heat;
    else if (out.name === undefined) out.name = part;
  }
  return out;
}

const COORD_RE = /\[\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\]/;
const AT_RE = /\bat:\s*(t\d+)\b/i;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Parses an `item: Label [x,y]` / `item: Label at: tN` header plus its body. */
function parseItem(lines: string[], headerIdx: number): { item: MatrixItem; nextIdx: number } | { error: string } {
  const value = lines[headerIdx].trim().slice("item:".length).trim();

  let label = value;
  let x: number | undefined;
  let y: number | undefined;
  let at: string | undefined;

  const coord = value.match(COORD_RE);
  const atMatch = value.match(AT_RE);
  if (coord) {
    x = clamp01(Number(coord[1]));
    y = clamp01(Number(coord[2]));
    label = value.replace(COORD_RE, "").trim();
  } else if (atMatch) {
    at = atMatch[1].toLowerCase();
    label = value.slice(0, atMatch.index).trim();
  } else {
    return { error: `Line ${headerIdx + 1}: item needs a position — "[x, y]" or "at: tN"` };
  }
  if (!label) return { error: `Line ${headerIdx + 1}: item requires a label` };

  // Consume indented body lines.
  const body: string[] = [];
  let i = headerIdx + 1;
  let indent = -1;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "" || raw.trim().startsWith("//")) {
      if (indent !== -1) body.push("");
      continue;
    }
    const lineIndent = raw.search(/\S/);
    if (lineIndent <= 0) break;
    if (indent === -1) indent = lineIndent;
    if (lineIndent < indent) break;
    body.push(raw.slice(indent));
  }
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();

  return { item: { label, content: body.join("\n"), x, y, at }, nextIdx: i };
}

/**
 * Parses the unified matrix source. `presetOverride` comes from the dispatcher,
 * which already split `type: matrix, <preset>` into id + variant and blanked
 * the type: line.
 *
 * Grammar: `x:`/`y:` axes (title + `|`-separated ticks → equal bands → an N×M
 * cell grid), `tN:` cell name/heat overrides, and `item:` cards placed by a
 * `[x, y]` coordinate or snapped to a cell with `at: tN`.
 */
export function parseMatrix(source: string, presetOverride?: string): MatrixResult {
  const presetRes = resolvePreset(presetOverride);
  if (presetRes && typeof presetRes === "object") return { ok: false, error: presetRes.error };
  const preset = presetRes;

  const lines = source.split("\n");
  let xAxis: MatrixAxis | null = null;
  let yAxis: MatrixAxis | null = null;
  const overrides = new Map<string, { name?: string; heat?: Heat }>();
  const items: MatrixItem[] = [];
  const seenLabels = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (trimmed === "" || trimmed.startsWith("//")) { i++; continue; }
    if (lower.startsWith("title:") || lower.startsWith("collapsed:") || lower.startsWith("type:") || lower.startsWith("layout:")) { i++; continue; }

    if (raw.search(/\S/) > 0) {
      return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
    }

    if (lower.startsWith("x:")) { xAxis = parseAxis(trimmed.slice(2)); i++; continue; }
    if (lower.startsWith("y:")) { yAxis = parseAxis(trimmed.slice(2)); i++; continue; }

    if (/^t\d+\s*:/.test(lower)) {
      const cell = parseCell(trimmed);
      overrides.set(cell.id, { name: cell.name, heat: cell.heat });
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

    return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}". Use "x:", "y:", "tN:", or "item:"` };
  }

  // Fall back to preset axes when the author didn't override them.
  const def = preset ? PRESETS[preset] : null;
  if (!xAxis) {
    if (!def) return { ok: false, error: `A matrix needs an "x:" axis (or a preset that supplies one)` };
    xAxis = { title: def.xTitle(), ticks: def.xTicks() };
  }
  if (!yAxis) {
    if (!def) return { ok: false, error: `A matrix needs a "y:" axis (or a preset that supplies one)` };
    yAxis = { title: def.yTitle(), ticks: def.yTicks() };
  }

  const cols = xAxis.ticks.length;
  const rows = yAxis.ticks.length;
  const cellCount = cols * rows;

  // Validate cell references (overrides + item `at:`) against the grid.
  const validId = (id: string): boolean => {
    const n = Number(id.slice(1));
    return Number.isInteger(n) && n >= 1 && n <= cellCount;
  };
  for (const id of overrides.keys()) {
    if (!validId(id)) return { ok: false, error: `Unknown cell "${id}" — this grid has cells t1…t${cellCount}` };
  }
  for (const item of items) {
    if (item.at && !validId(item.at)) {
      return { ok: false, error: `Item "${item.label}" targets unknown cell "${item.at}" — this grid has cells t1…t${cellCount}` };
    }
  }

  const cells = resolveCells(preset, cols, rows, overrides);
  return { ok: true, data: { preset, xAxis, yAxis, cells, items } };
}
