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

const WIKI_LINK_RE = /\[\[#([^\]]+)\]\]/;
const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/;

/** Parses an `item: Label [x,y]` / `item: Label at: tN` header plus its body.
 *  A `[[#Heading]]` or `[text](target)` link annotation may precede the position
 *  token (placed before the coordinate so the shared inline-link stripper, which
 *  only fires at end-of-line, leaves it for us). */
function parseItem(lines: string[], headerIdx: number): { item: MatrixItem | null; nextIdx: number; warnings: string[] } {
  const warnings: string[] = [];
  let value = lines[headerIdx].trim().slice("item:".length).trim();

  let linkHeading: string | undefined;
  let linkTicket: string | undefined;
  const strip = (m: RegExpMatchArray): void => {
    value = (value.slice(0, m.index) + value.slice((m.index ?? 0) + m[0].length)).trim();
  };
  const wiki = value.match(WIKI_LINK_RE);
  if (wiki) {
    linkHeading = wiki[1].trim();
    strip(wiki);
  } else {
    const md = value.match(MD_LINK_RE);
    if (md) {
      const target = md[1].trim();
      if (target.startsWith("#")) {
        try { linkHeading = decodeURIComponent(target.slice(1)); } catch { linkHeading = target.slice(1); }
      } else {
        linkTicket = target;
      }
      strip(md);
    }
  }

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
    // Recoverable: an item with no position is dropped at the plane centre.
    warnings.push(`Line ${headerIdx + 1}: item "${label || "(unnamed)"}" has no position — placed at the centre`);
    x = 0.5;
    y = 0.5;
  }

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

  // Recoverable: an item with no label can't be identified/edited — skip it.
  if (!label) {
    warnings.push(`Line ${headerIdx + 1}: item has no label — skipped`);
    return { item: null, nextIdx: i, warnings };
  }

  return { item: { label, content: body.join("\n"), x, y, at, linkHeading, linkTicket }, nextIdx: i, warnings };
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
  const warnings: string[] = [];
  const presetRes = resolvePreset(presetOverride);
  // Recoverable: an unknown preset falls back to a blank matrix (which still
  // needs its own x:/y: axes — that stays fatal below).
  let preset: MatrixPreset | null;
  if (presetRes && typeof presetRes === "object") {
    warnings.push(presetRes.error);
    preset = null;
  } else {
    preset = presetRes;
  }

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
      warnings.push(`Line ${i + 1}: unexpected indentation — skipped`);
      i++; continue;
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
      warnings.push(...res.warnings);
      i = res.nextIdx;
      if (!res.item) continue;
      const key = res.item.label.toLowerCase();
      if (seenLabels.has(key)) {
        warnings.push(`Line ${i + 1}: duplicate "item: ${res.item.label}" — later one skipped`);
        continue;
      }
      seenLabels.add(key);
      items.push(res.item);
      continue;
    }

    warnings.push(`Line ${i + 1}: unexpected line "${trimmed}" — skipped`);
    i++;
  }

  // Fall back to preset axes when the author didn't override them. A matrix with
  // no grid at all is genuinely unrenderable, so a missing axis stays fatal.
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

  // Validate cell references. An out-of-range override is dropped; an item
  // pinned to an unknown cell falls back to the plane centre — both warn.
  const validId = (id: string): boolean => {
    const n = Number(id.slice(1));
    return Number.isInteger(n) && n >= 1 && n <= cellCount;
  };
  for (const id of [...overrides.keys()]) {
    if (!validId(id)) {
      warnings.push(`Unknown cell "${id}" — this grid has cells t1…t${cellCount} — ignored`);
      overrides.delete(id);
    }
  }
  for (const item of items) {
    if (item.at && !validId(item.at)) {
      warnings.push(`Item "${item.label}" targets unknown cell "${item.at}" — placed at the centre`);
      item.at = undefined;
      item.x = 0.5;
      item.y = 0.5;
    }
  }

  const cells = resolveCells(preset, cols, rows, overrides);
  return { ok: true, data: { preset, xAxis, yAxis, cells, items, warnings: warnings.length ? warnings : undefined } };
}
