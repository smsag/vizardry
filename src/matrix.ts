import type { MatrixData, MatrixResult, MatrixType } from "./types";
import { parseFrameworkSource } from "./parser";

function resolveMatrixType(value: string): MatrixType | null {
  const v = value.trim().toLowerCase();
  if (v === "pain" || v === "opportunity" || v === "impact") return v;
  return null;
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
      return { ok: false, error: `Unknown type "${typeOverride.trim().toLowerCase()}" — expected "pain", "opportunity", or "impact"` };
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
        return { ok: false, error: `Unknown type "${value.trim().toLowerCase()}" — expected "pain", "opportunity", or "impact"` };
      }
      type = resolved;
      lines[i] = ""; // blank, not remove — keeps line numbers stable for error messages
    }
  }

  const result = parseFrameworkSource(lines.join("\n"));
  if (!result.ok) return result;

  return { ok: true, data: { type, data: result.data, cardBlocks: result.cardBlocks, allCards: result.allCards } };
}
