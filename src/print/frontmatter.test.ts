import { describe, it, expect } from "vitest";
import { stripFrontmatter } from "./frontmatter";

describe("stripFrontmatter", () => {
  it("removes a leading YAML block and keeps the body", () => {
    const md = "---\ntitle: Hi\ntags: [a, b]\n---\n# Heading\n\nBody.";
    expect(stripFrontmatter(md)).toBe("# Heading\n\nBody.");
  });

  it("leaves notes without frontmatter untouched", () => {
    const md = "# Heading\n\nBody with --- inside.";
    expect(stripFrontmatter(md)).toBe(md);
  });

  it("does not treat a mid-document thematic break as frontmatter", () => {
    const md = "Intro\n\n---\n\nMore.";
    expect(stripFrontmatter(md)).toBe(md);
  });

  it("handles CRLF line endings and a trailing BOM", () => {
    const md = "﻿---\r\nk: v\r\n---\r\nBody";
    expect(stripFrontmatter(md)).toBe("Body");
  });

  it("strips a frontmatter-only file to empty", () => {
    expect(stripFrontmatter("---\nk: v\n---\n")).toBe("");
  });
});
