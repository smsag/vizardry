import type { MatrixData, MatrixLayout, MatrixResult, MatrixType } from "./types";
import { parseFrameworkSource } from "./parser";
import { parsePlot } from "./plot";

function resolveMatrixType(value: string): MatrixType | null {
  const v = value.trim().toLowerCase();
  if (v === "pain" || v === "opportunity" || v === "impact" || v === "assumption") return v;
  return null;
}

/**
 * Pulls the optional `layout:` line (grid | plot) out of the top-level lines,
 * blanking it. Defaults to "grid" so every existing matrix is unaffected.
 * Returns an error string for an unrecognised value.
 */
function extractLayout(lines: string[]): { layout: MatrixLayout } | { error: string } {
  let layout: MatrixLayout = "grid";
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.toLowerCase().startsWith("layout:")) continue;
    const value = trimmed.slice("layout:".length).trim().toLowerCase();
    if (value !== "grid" && value !== "plot") {
      return { error: `Line ${i + 1}: unknown layout "${value}" — expected "grid" or "plot"` };
    }
    layout = value;
    lines[i] = "";
  }
  return { layout };
}

/**
 * Pulls optional `x-axis:` / `y-axis:` title overrides out of the top-level
 * lines, blanking them (never removing — keeps line numbers stable for error
 * messages) so parseFrameworkSource never sees a line it doesn't understand.
 * Only the axis *name* is taken; a `| low | high` pole suffix (scenario syntax)
 * is tolerated and ignored, since the 4×4 grid has its own curated tick labels.
 */
function extractAxisTitles(lines: string[]): { xAxis?: string; yAxis?: string } {
  const out: { xAxis?: string; yAxis?: string } = {};
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lower = trimmed.toLowerCase();
    let key: "xAxis" | "yAxis" | null = null;
    if (lower.startsWith("x-axis:")) key = "xAxis";
    else if (lower.startsWith("y-axis:")) key = "yAxis";
    if (!key) continue;
    const raw = trimmed.slice("x-axis:".length); // same length as "y-axis:"
    const pipeIdx = raw.indexOf("|");
    const name = (pipeIdx !== -1 ? raw.slice(0, pipeIdx) : raw).trim();
    if (name) out[key] = name;
    lines[i] = "";
  }
  return out;
}

/**
 * Parses the Pain/Opportunity/Impact matrix source.
 *
 * `typeOverride`, when provided (e.g. by the vizardry dispatcher, which
 * already split a compound "type: matrix, pain" line into id + variant),
 * is used instead of scanning `source` for its own `type:` line — but is
 * still validated exactly as a scanned value would be, so an unrecognized
 * variant produces the same error either way.
 */
export function parseMatrix(source: string, typeOverride?: string): MatrixResult {
  const lines = source.split("\n");
  let type: MatrixType = "pain";

  if (typeOverride !== undefined) {
    const resolved = resolveMatrixType(typeOverride);
    if (!resolved) {
      return { ok: false, error: `Unknown type "${typeOverride.trim().toLowerCase()}" — expected "pain", "opportunity", "impact", "assumption", or "scenario"` };
    }
    type = resolved;
    // The dispatcher already blanked the type: line it dispatched on, but
    // defensively blank any other top-level type: line too (e.g. a stray
    // duplicate) so it doesn't trip up parseFrameworkSource below — it must
    // not override `type`, since the caller-supplied value is authoritative.
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().toLowerCase().startsWith("type:")) lines[i] = "";
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed.toLowerCase().startsWith("type:")) continue;
      const value = trimmed.slice("type:".length);
      const resolved = resolveMatrixType(value);
      if (!resolved) {
        return { ok: false, error: `Unknown type "${value.trim().toLowerCase()}" — expected "pain", "opportunity", "impact", "assumption", or "scenario"` };
      }
      type = resolved;
      lines[i] = ""; // blank, not remove — keeps line numbers stable for error messages
    }
  }

  const layoutRes = extractLayout(lines);
  if ("error" in layoutRes) return { ok: false, error: layoutRes.error };
  const { layout } = layoutRes;

  // Plot mode is a different engine (continuous coordinates, author-declared
  // heat) — its axis lines are data, so it does NOT go through the grid parser
  // or the grid axis-title extraction.
  if (layout === "plot") {
    const plotRes = parsePlot(lines.join("\n"));
    if (!plotRes.ok) return plotRes;
    return { ok: true, data: { type, layout, data: {}, cardBlocks: new Set(), allCards: false, plot: plotRes.data } };
  }

  const { xAxis, yAxis } = extractAxisTitles(lines);

  const result = parseFrameworkSource(lines.join("\n"));
  if (!result.ok) return result;

  return { ok: true, data: { type, layout, data: result.data, cardBlocks: result.cardBlocks, allCards: result.allCards, xAxis, yAxis } };
}
