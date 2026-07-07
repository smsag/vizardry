import type { RACIData, RACIResult, RACIRow } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const CELL_KEYS = ["responsible", "accountable", "consulted", "informed"] as const;
type CellKey = typeof CELL_KEYS[number];

function emptyRow(task: string): RACIRow {
  return { task, responsible: "", accountable: "", consulted: "", informed: "" };
}

/**
 * Parses RACI Matrix syntax:
 *
 *   task: Task name
 *     responsible: Developer
 *     accountable: PM
 *     consulted: QA, Designer
 *     informed: Stakeholder
 *
 * All four RACI keys are optional per task — missing ones render as empty.
 * A warning is emitted (but not a hard error) if accountable has multiple
 * names, since RACI best practice requires exactly one accountable person.
 */
export function parseRACIMatrix(source: string): RACIResult {
  const lines = source.split("\n");
  const rows: RACIRow[] = [];
  let current: RACIRow | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      if (!trimmed.startsWith("task:")) {
        return { ok: false, error: `Line ${i + 1}: expected "task: <name>" but got "${trimmed}"` };
      }
      const taskName = trimmed.slice("task:".length).trim();
      if (!taskName) {
        return { ok: false, error: `Line ${i + 1}: task requires a name` };
      }
      current = emptyRow(taskName);
      rows.push(current);
      continue;
    }

    if (!current) {
      return { ok: false, error: `Line ${i + 1}: cell key before any "task:"` };
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      return { ok: false, error: `Line ${i + 1}: expected "key: value", got "${trimmed}"` };
    }

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase() as CellKey;
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!(CELL_KEYS as readonly string[]).includes(key)) {
      return {
        ok: false,
        error: `Line ${i + 1}: unknown key "${key}" — expected one of: ${CELL_KEYS.join(", ")}`,
      };
    }

    if (current[key]) {
      return { ok: false, error: `Line ${i + 1}: duplicate key "${key}" in the same task` };
    }

    current[key] = value;
  }

  // Empty is valid — the renderer shows column definitions as placeholder
  return { ok: true, data: { rows } };
}
