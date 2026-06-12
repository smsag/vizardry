import { describe, it, expect } from "vitest";
import { parseRoadmap } from "./roadmap";

describe("parseRoadmap", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("parses all three columns with items", () => {
    const src = [
      "now:",
      "  item: Ship login",
      "next:",
      "  item: Onboarding redesign",
      "later:",
      "  item: Dark mode",
    ].join("\n");
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { columns } = result.data;
    expect(columns).toHaveLength(3);
    expect(columns[0].id).toBe("now");
    expect(columns[0].items[0].title).toBe("Ship login");
    expect(columns[1].id).toBe("next");
    expect(columns[2].id).toBe("later");
  });

  it("parses item with pipe subtitle", () => {
    const src = "now:\n  item: Auth | AUTH-1234\nnext:\nlater:";
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.data.columns[0].items[0];
    expect(item.title).toBe("Auth");
    expect(item.subtitle).toBe("AUTH-1234");
  });

  it("parses item without subtitle — subtitle is empty string", () => {
    const src = "now:\n  item: Ship it\nnext:\nlater:";
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns[0].items[0].subtitle).toBe("");
  });

  it("returns ok with empty columns for an empty source", () => {
    const result = parseRoadmap("");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns.every(c => c.items.length === 0)).toBe(true);
  });

  it("returns ok with columns having no items when only headers present", () => {
    const result = parseRoadmap("now:\nnext:\nlater:");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns[0].items).toHaveLength(0);
  });

  it("allows multiple items per column", () => {
    const src = "now:\n  item: A\n  item: B\n  item: C\nnext:\nlater:";
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns[0].items).toHaveLength(3);
  });

  it("ignores blank lines", () => {
    const src = "\nnow:\n\n  item: A\n\nnext:\nlater:\n";
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns[0].items).toHaveLength(1);
  });

  it("ignores // comment lines", () => {
    const src = "// a comment\nnow:\n  // inline\n  item: A\nnext:\nlater:";
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns[0].items[0].title).toBe("A");
  });

  it("ignores title: line", () => {
    const src = "title: My Roadmap\nnow:\n  item: A\nnext:\nlater:";
    expect(parseRoadmap(src).ok).toBe(true);
  });

  it("preserves column order as now → next → later regardless of source order", () => {
    const src = "later:\nnow:\nnext:";
    const result = parseRoadmap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.columns.map(c => c.id)).toEqual(["now", "next", "later"]);
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it("returns error for unknown top-level keyword", () => {
    const result = parseRoadmap("soon:\n  item: A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unexpected key/i);
  });

  it("returns error for indented content before any column header", () => {
    const result = parseRoadmap("  item: A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outside a column block/i);
  });

  it("returns error for non-item indented line inside a column", () => {
    const result = parseRoadmap("now:\n  task: A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/expected "item:/i);
  });

  it("returns error for item with no title", () => {
    const result = parseRoadmap("now:\n  item:\nnext:\nlater:");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/item requires a title/i);
  });

  it("includes the line number in every error", () => {
    const result = parseRoadmap("now:\n  item:\nnext:\nlater:");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line 2/i);
  });
});
