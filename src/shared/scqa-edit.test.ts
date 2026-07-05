import { describe, it, expect } from "vitest";
import { reorderSCQAInterior } from "./scqa-edit";

// Interior = the lines between the code fences (situation line + descendants).
const base = [
  "situation: S",
  "  Complication one",
  "    Question one",
  "      Answer one",
  "  Complication two",
  "    Question two",
];

describe("reorderSCQAInterior", () => {
  it("moves a complication (with its whole subtree) before an earlier sibling", () => {
    const out = reorderSCQAInterior(base, "Complication two", 0);
    expect(out).toEqual([
      "situation: S",
      "  Complication two",
      "    Question two",
      "  Complication one",
      "    Question one",
      "      Answer one",
    ]);
  });

  it("moves a complication to the end, carrying its subtree", () => {
    const out = reorderSCQAInterior(base, "Complication one", 2);
    expect(out).toEqual([
      "situation: S",
      "  Complication two",
      "    Question two",
      "  Complication one",
      "    Question one",
      "      Answer one",
    ]);
  });

  it("reorders questions within a single complication", () => {
    const lines = [
      "situation: S",
      "  Complication",
      "    Question one",
      "      Answer one",
      "    Question two",
      "      Answer two",
    ];
    const out = reorderSCQAInterior(lines, "Question two", 0);
    expect(out).toEqual([
      "situation: S",
      "  Complication",
      "    Question two",
      "      Answer two",
      "    Question one",
      "      Answer one",
    ]);
  });

  it("returns null for a no-op move (same position)", () => {
    expect(reorderSCQAInterior(base, "Complication one", 0)).toBeNull();
    expect(reorderSCQAInterior(base, "Complication one", 1)).toBeNull();
  });

  it("returns null when the node is not found", () => {
    expect(reorderSCQAInterior(base, "Nonexistent", 0)).toBeNull();
  });

  it("never targets the situation root", () => {
    // "S" is the root; it must not be draggable/found as a reorder target.
    expect(reorderSCQAInterior(base, "S", 0)).toBeNull();
  });

  it("preserves interleaved blank lines outside the moved block", () => {
    const lines = [
      "situation: S",
      "",
      "  Complication one",
      "  Complication two",
    ];
    const out = reorderSCQAInterior(lines, "Complication two", 0);
    expect(out).toEqual([
      "situation: S",
      "",
      "  Complication two",
      "  Complication one",
    ]);
  });
});
