import type { BuyerUtilityMapData, UtilityCell, UtilityKind, BuyerUtilityMapResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

// Canonical Blue Ocean stages (buyer experience cycle) and utility levers.
export const DEFAULT_STAGES = ["Purchase", "Delivery", "Use", "Supplements", "Maintenance", "Disposal"];
export const DEFAULT_LEVERS = ["Customer Productivity", "Simplicity", "Convenience", "Risk", "Fun & Image", "Environmental"];
const MIN_AXIS = 2;
const MAX_AXIS = 8;

/**
 * Resolves a user-typed stage/lever name against the axis list: an exact
 * (case-insensitive) match first, then a unique prefix match, so short aliases
 * like "Productivity" → "Customer Productivity" or "Fun" → "Fun & Image" work.
 * Returns the axis index, or -1 if nothing (or more than one thing) matches.
 */
function resolveAxis(input: string, axis: string[]): number {
  const q = input.trim().toLowerCase();
  if (q === "") return -1;
  const exact = axis.findIndex(a => a.toLowerCase() === q);
  if (exact !== -1) return exact;
  // Alias match: a prefix on either side ("Fun" ↔ "Fun & Image"), or the query
  // matching a whole word of the label ("Productivity" → "Customer Productivity").
  const candidates = axis
    .map((a, i) => ({ i, a: a.toLowerCase() }))
    .filter(({ a }) => a.startsWith(q) || q.startsWith(a) || a.split(/\s+/).includes(q));
  return candidates.length === 1 ? candidates[0].i : -1;
}

/** Parses an optional `stages:`/`levers:` override line (pipe-separated). */
function parseAxisOverride(value: string, fallback: string[], label: string, lineNum: number, warnings: string[]): string[] {
  const names = value.split("|").map(s => s.trim()).filter(s => s !== "");
  if (names.length < MIN_AXIS) {
    warnings.push(`Line ${lineNum}: "${label}:" needs at least ${MIN_AXIS} names — using the defaults`);
    return fallback;
  }
  if (names.length > MAX_AXIS) {
    warnings.push(`Line ${lineNum}: "${label}:" capped at ${MAX_AXIS} — extra names dropped`);
    return names.slice(0, MAX_AXIS);
  }
  return names;
}

/**
 * Parses Buyer Utility Map (Blue Ocean) syntax:
 *
 *   utility: Purchase | Convenience | Buy in-app, instant access
 *   pain:    Delivery | Risk        | Slow returns erode trust
 *
 * Each `utility:`/`pain:` line addresses one cell positionally —
 * `<Stage> | <Lever> | <note?>` (note optional). The canonical six stages and
 * six levers default in; optional `stages:` / `levers:` lines (pipe-separated)
 * override them.
 *
 * Parsing is graceful: an unknown stage/lever, a missing field, an unrecognised
 * keyword, or a duplicated cell each skip with a warning. The grid always
 * renders (the empty cells are the point), so it is never fatal.
 */
export function parseBuyerUtilityMap(source: string): BuyerUtilityMapResult {
  const lines = source.split("\n");
  const warnings: string[] = [];

  let stages = DEFAULT_STAGES;
  let levers = DEFAULT_LEVERS;

  // First pass: axis overrides (so cell lines resolve against the final axes
  // regardless of ordering).
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("stages:")) {
      stages = parseAxisOverride(trimmed.slice("stages:".length), DEFAULT_STAGES, "stages", i + 1, warnings);
    } else if (lower.startsWith("levers:")) {
      levers = parseAxisOverride(trimmed.slice("levers:".length), DEFAULT_LEVERS, "levers", i + 1, warnings);
    }
  }

  const cells: UtilityCell[] = [];
  const occupied = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("stages:") || lower.startsWith("levers:")) continue; // handled above

    let kind: UtilityKind;
    if (lower.startsWith("utility:")) kind = "utility";
    else if (lower.startsWith("pain:")) kind = "pain";
    else {
      warnings.push(`Line ${lineNum}: ignored — expected "utility:", "pain:", "stages:" or "levers:"`);
      continue;
    }

    const rest = trimmed.slice(trimmed.indexOf(":") + 1);
    const parts = rest.split("|").map(s => s.trim());
    const stageRaw = parts[0] ?? "";
    const leverRaw = parts[1] ?? "";
    const note = parts.slice(2).join(" | ").trim() || undefined;

    if (!stageRaw || !leverRaw) {
      warnings.push(`Line ${lineNum}: skipped — expected "<Stage> | <Lever> | <note>"`);
      continue;
    }

    const stageIndex = resolveAxis(stageRaw, stages);
    if (stageIndex === -1) {
      warnings.push(`Line ${lineNum}: unknown stage "${stageRaw}" — skipped`);
      continue;
    }
    const leverIndex = resolveAxis(leverRaw, levers);
    if (leverIndex === -1) {
      warnings.push(`Line ${lineNum}: unknown lever "${leverRaw}" — skipped`);
      continue;
    }

    const cellKey = `${stageIndex}:${leverIndex}`;
    if (occupied.has(cellKey)) {
      warnings.push(`Line ${lineNum}: cell "${stages[stageIndex]} / ${levers[leverIndex]}" already marked (line ${occupied.get(cellKey)}) — skipped`);
      continue;
    }
    occupied.set(cellKey, lineNum);
    cells.push({ stageIndex, leverIndex, kind, note });
  }

  const data: BuyerUtilityMapData = {
    stages, levers, cells,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
  return { ok: true, data };
}
