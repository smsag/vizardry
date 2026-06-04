import type { SIPOCData, SIPOCResult, SIPOCRow } from "./types";

const CELL_KEYS = ["supplier", "input", "process", "output", "customer", "owner", "metric"] as const;
type CellKey = typeof CELL_KEYS[number];

function emptyRow(): SIPOCRow {
  return { supplier: "", input: "", process: "", output: "", customer: "", owner: "", metric: "" };
}

/**
 * Parses row-wise SIPOC syntax:
 *
 *   row:
 *     supplier: Dev team
 *     input: Feature branch
 *     process: Build artefact
 *     output: Running service
 *     customer: End users
 *
 * All five cell keys are optional per row — missing ones render as empty.
 */
export function parseSIPOC(source: string): SIPOCResult {
  const lines = source.split("\n");
  const rows: SIPOCRow[] = [];
  let current: SIPOCRow | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("title:")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      const keyword = trimmed.toLowerCase().replace(/:$/, "");
      if (keyword !== "row") {
        return { ok: false, error: `Line ${i + 1}: expected "row:" but got "${trimmed}"` };
      }
      current = emptyRow();
      rows.push(current);
      continue;
    }

    // Indented line — must be inside a row
    if (!current) {
      return { ok: false, error: `Line ${i + 1}: cell key before any "row:"` };
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      return { ok: false, error: `Line ${i + 1}: expected "key: value", got "${trimmed}"` };
    }

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase() as CellKey;
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!(CELL_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `Line ${i + 1}: unknown cell key "${key}" — expected one of: ${CELL_KEYS.join(", ")}` };
    }

    if (current[key]) {
      return { ok: false, error: `Line ${i + 1}: duplicate key "${key}" in the same row` };
    }

    current[key] = value;
  }

  if (rows.length === 0) {
    return { ok: false, error: `No rows defined — start each row with "row:"` };
  }

  return { ok: true, data: { rows } };
}
