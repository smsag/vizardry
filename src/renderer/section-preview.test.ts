import { describe, it, expect } from "vitest";
import type { HeadingCache } from "obsidian";
import { extractSection } from "./section-preview";

// Build a headings array whose offsets match `content` by locating each
// heading line, mirroring what Obsidian's metadata cache provides.
function headingsFor(content: string, specs: { heading: string; level: number; marker: string }[]): HeadingCache[] {
  return specs.map(s => {
    const offset = content.indexOf(s.marker);
    return { heading: s.heading, level: s.level, position: { start: { offset } } } as unknown as HeadingCache;
  });
}

const content = [
  "Intro line before any heading",
  "## Alpha",
  "Alpha body one",
  "Alpha body two",
  "### Alpha sub",
  "Sub body",
  "## Beta",
  "Beta body",
].join("\n");

const headings = headingsFor(content, [
  { heading: "Alpha", level: 2, marker: "## Alpha" },
  { heading: "Alpha sub", level: 3, marker: "### Alpha sub" },
  { heading: "Beta", level: 2, marker: "## Beta" },
]);

describe("extractSection", () => {
  it("returns the heading down to the next same-or-higher heading", () => {
    const out = extractSection(content, headings, "Alpha");
    expect(out).toBe([
      "## Alpha",
      "Alpha body one",
      "Alpha body two",
      "### Alpha sub",
      "Sub body",
    ].join("\n"));
    // The next ## (Beta) is excluded; the nested ### is included.
    expect(out).not.toContain("Beta");
  });

  it("clips a subsection at the next heading of equal-or-higher level", () => {
    const out = extractSection(content, headings, "Alpha sub");
    expect(out).toBe(["### Alpha sub", "Sub body"].join("\n"));
  });

  it("runs the last heading to end of file", () => {
    const out = extractSection(content, headings, "Beta");
    expect(out).toBe(["## Beta", "Beta body"].join("\n"));
  });

  it("matches case-insensitively", () => {
    expect(extractSection(content, headings, "alpha SUB")).toBe(["### Alpha sub", "Sub body"].join("\n"));
  });

  it("returns null when the heading is not found", () => {
    expect(extractSection(content, headings, "Nonexistent")).toBeNull();
  });
});
