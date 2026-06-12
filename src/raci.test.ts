import { describe, it, expect } from "vitest";
import { parseRACIMatrix } from "./raci";

describe("parseRACIMatrix", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("parses a task with all four RACI roles", () => {
    const src = [
      "task: Write code",
      "  responsible: Developer",
      "  accountable: PM",
      "  consulted: QA",
      "  informed: Stakeholder",
    ].join("\n");
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(1);
    const row = result.data.rows[0];
    expect(row.task).toBe("Write code");
    expect(row.responsible).toBe("Developer");
    expect(row.accountable).toBe("PM");
    expect(row.consulted).toBe("QA");
    expect(row.informed).toBe("Stakeholder");
  });

  it("allows partial role assignment — missing roles are empty strings", () => {
    const src = "task: Deploy\n  responsible: DevOps";
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.data.rows[0];
    expect(row.responsible).toBe("DevOps");
    expect(row.accountable).toBe("");
    expect(row.consulted).toBe("");
    expect(row.informed).toBe("");
  });

  it("accepts comma-separated values in a role cell", () => {
    const src = "task: Plan\n  responsible: Dev, Designer";
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0].responsible).toBe("Dev, Designer");
  });

  it("parses multiple tasks", () => {
    const src = "task: Alpha\n  responsible: A\ntask: Beta\n  accountable: B";
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[0].task).toBe("Alpha");
    expect(result.data.rows[1].task).toBe("Beta");
  });

  it("returns ok with empty rows for an empty source", () => {
    const result = parseRACIMatrix("");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(0);
  });

  it("ignores blank lines", () => {
    const src = "\ntask: T\n\n  responsible: X\n";
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(1);
  });

  it("ignores // comment lines", () => {
    const src = "// comment\ntask: T\n  // inner comment\n  responsible: X";
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0].responsible).toBe("X");
  });

  it("ignores title: line", () => {
    const src = "title: My Matrix\ntask: T\n  responsible: X";
    const result = parseRACIMatrix(src);
    expect(result.ok).toBe(true);
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it("returns error for task: with no name", () => {
    const result = parseRACIMatrix("task:");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/task requires a name/i);
  });

  it("returns error for indented content before any task:", () => {
    const result = parseRACIMatrix("  responsible: X");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/before any "task:"/i);
  });

  it("returns error for unknown cell key", () => {
    const result = parseRACIMatrix("task: T\n  driver: X");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unknown key/i);
  });

  it("returns error for duplicate cell key in the same task", () => {
    const result = parseRACIMatrix("task: T\n  responsible: A\n  responsible: B");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/duplicate key/i);
  });

  it("returns error for unrecognised top-level keyword", () => {
    const result = parseRACIMatrix("garbage:");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/expected "task:/i);
  });

  it("includes the line number in every error", () => {
    const result = parseRACIMatrix("task: T\n  responsible: A\n  responsible: B");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line 3/i);
  });
});
