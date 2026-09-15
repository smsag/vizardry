import { describe, it, expect } from "vitest";
import { indentOf, TAB_WIDTH } from "./indent";

describe("indentOf", () => {
  it("counts leading spaces", () => {
    expect(indentOf("abc")).toBe(0);
    expect(indentOf("  abc")).toBe(2);
    expect(indentOf("    abc")).toBe(4);
  });

  it("counts a tab as TAB_WIDTH columns, so tab and space indents agree", () => {
    expect(indentOf("\tabc")).toBe(TAB_WIDTH);
    expect(indentOf("\t\tabc")).toBe(2 * TAB_WIDTH);
    expect(indentOf("\t  abc")).toBe(TAB_WIDTH + 2);
  });

  it("returns -1 for a blank or whitespace-only line, like search(/\\S/)", () => {
    expect(indentOf("")).toBe(-1);
    expect(indentOf("   ")).toBe(-1);
    expect(indentOf("\t")).toBe(-1);
    expect(indentOf("  \r")).toBe(-1);
  });
});
