import type { RACIResult, RACIRow } from "./types";
import { isSkippableLine } from "./shared/indent-tree";
import { indentOf } from "./shared/indent";

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
  const warnings: string[] = [];
  let current: RACIRow | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isSkippableLine(raw)) continue;

    const indent = indentOf(raw);

    if (indent === 0) {
      if (!trimmed.toLowerCase().startsWith("task:")) {
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
    if (key === "accountable" && value.split(",").filter(n => n.trim()).length > 1) {
      warnings.push(`Line ${i + 1}: "${current.task}" has more than one accountable person — RACI expects exactly one`);
    }
  }

  // Empty is valid — the renderer shows column definitions as placeholder
  return { ok: true, data: { rows, ...(warnings.length > 0 ? { warnings } : {}) } };
}

// ── People × roles view ──────────────────────────────────────────────────────
//
// The source is written task by task (one `responsible:` line listing names),
// but a RACI chart is read person by person: who owns what, who is overloaded,
// which task has nobody accountable. These helpers turn the per-task cells
// into that matrix and back, so the renderer and the write-back agree on how a
// cell's names are split and matched.

export type RACIRole = typeof CELL_KEYS[number];
export const RACI_ROLES: readonly RACIRole[] = CELL_KEYS;

/** Names in one cell: comma-separated, trimmed, blanks dropped. */
export function splitNames(value: string): string[] {
  return value.split(",").map(n => n.trim()).filter(Boolean);
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Everyone named anywhere in the matrix, once each (case-insensitive, first
 * spelling wins), in reading order: task by task, R → A → C → I. That puts
 * the people doing the work at the left, where the eye starts.
 */
export function raciPeople(rows: RACIRow[]): string[] {
  const people: string[] = [];
  for (const row of rows) {
    for (const role of CELL_KEYS) {
      for (const name of splitNames(row[role])) {
        if (!people.some(p => sameName(p, name))) people.push(name);
      }
    }
  }
  return people;
}

/** The roles `person` holds on `row` — usually one, possibly several. */
export function rolesOf(row: RACIRow, person: string): RACIRole[] {
  return CELL_KEYS.filter(role => splitNames(row[role]).some(n => sameName(n, person)));
}

/**
 * The four cell values after giving `person` exactly `role` on `row` (or no
 * role, for `null`). Other names keep their order and spelling.
 */
export function withRole(row: RACIRow, person: string, role: RACIRole | null): Record<RACIRole, string> {
  const out = {} as Record<RACIRole, string>;
  for (const key of CELL_KEYS) {
    const names = splitNames(row[key]).filter(n => !sameName(n, person));
    if (key === role) names.push(person);
    out[key] = names.join(", ");
  }
  return out;
}

/** The four cell values with every mention of `from` renamed to `to`. */
export function withRenamedPerson(row: RACIRow, from: string, to: string): Record<RACIRole, string> {
  const out = {} as Record<RACIRole, string>;
  for (const key of CELL_KEYS) {
    const names: string[] = [];
    for (const n of splitNames(row[key])) {
      const next = sameName(n, from) ? to : n;
      // Renaming onto someone already in the cell merges the two.
      if (!names.some(m => sameName(m, next))) names.push(next);
    }
    out[key] = names.join(", ");
  }
  return out;
}

export type RACIIssue = "noAccountable" | "multipleAccountable" | "noResponsible";

/**
 * What the RACI rules say is wrong with one task: exactly one Accountable,
 * at least one Responsible. A task with no names at all is still being
 * written and is not flagged.
 */
export function raciIssues(row: RACIRow): RACIIssue[] {
  const counts = CELL_KEYS.map(k => splitNames(row[k]).length);
  if (counts.every(c => c === 0)) return [];
  const issues: RACIIssue[] = [];
  const accountable = splitNames(row.accountable).length;
  if (accountable === 0) issues.push("noAccountable");
  if (accountable > 1) issues.push("multipleAccountable");
  if (splitNames(row.responsible).length === 0) issues.push("noResponsible");
  return issues;
}
