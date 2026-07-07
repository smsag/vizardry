import type { SIPOCData, SIPOCFlowLink, SIPOCResult, SIPOCRow, SIPOCVariant } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const CELL_KEYS = ["supplier", "input", "process", "output", "customer", "owner", "metric"] as const;
type CellKey = typeof CELL_KEYS[number];

function emptyRow(): SIPOCRow {
  return { supplier: "", input: "", process: "", output: "", customer: "", owner: "", metric: "" };
}

function resolveSIPOCVariant(value: string): SIPOCVariant | null {
  const v = value.trim().toLowerCase();
  if (v === "table" || v === "flow") return v;
  return null;
}

/**
 * Parses SIPOC source — one shared syntax feeding two views (see the doc
 * comment on `SIPOCData` in types.ts):
 *
 *   row:
 *     supplier: Dev team
 *     input: Feature branch
 *     process: Build artefact
 *     output: Running service
 *     customer: End users
 *     owner: Jane
 *     metric: Cycle time
 *
 *   link: Dev team -> Feature branch
 *
 * All seven cell keys are optional per row. `link:` lines are parsed
 * unconditionally (regardless of `typeOverride`) but only *syntax*-checked
 * here — whether a link's endpoints actually resolve to a cell is a flow-view
 * concern, validated at render time (see renderer/sipoc.ts), so a stale link
 * left over from editing a row never breaks table view.
 *
 * `typeOverride`, when provided by the vizardry dispatcher (e.g. "flow" from
 * "type: sipoc, flow"), selects the view; otherwise defaults to "table" —
 * so a plain "type: sipoc" behaves exactly as it always has.
 */
export function parseSIPOC(source: string, typeOverride?: string): SIPOCResult {
  let variant: SIPOCVariant = "table";
  if (typeOverride !== undefined) {
    const resolved = resolveSIPOCVariant(typeOverride);
    if (!resolved) {
      return { ok: false, error: `Unknown type "${typeOverride.trim().toLowerCase()}" — expected "table" or "flow"` };
    }
    variant = resolved;
  }

  const lines = source.split("\n");
  const rows: SIPOCRow[] = [];
  const links: SIPOCFlowLink[] = [];
  let current: SIPOCRow | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      if (trimmed.toLowerCase().startsWith("link:")) {
        current = null;
        const rest = trimmed.slice(trimmed.indexOf(":") + 1).trim();
        const arrowIdx = rest.indexOf("->");
        if (arrowIdx === -1) {
          return { ok: false, error: `Line ${i + 1}: link requires "->" separator, e.g. link: A -> B` };
        }
        const from = rest.slice(0, arrowIdx).trim();
        const to = rest.slice(arrowIdx + 2).trim();
        if (!from || !to) {
          return { ok: false, error: `Line ${i + 1}: link requires two node names` };
        }
        links.push({ from, to });
        continue;
      }

      const keyword = trimmed.toLowerCase().replace(/:$/, "");
      if (keyword !== "row") {
        return { ok: false, error: `Line ${i + 1}: expected "row:" or "link:" but got "${trimmed}"` };
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

  return { ok: true, data: { variant, rows, links } };
}
