import { describe, it, expect } from "vitest";
import { DEFAULT_PRINT_OPTIONS } from "./options";
import type { PrintOptions } from "./options";
import { getPrintTemplate } from "./templates";
import {
  buildHeadingBreaks,
  buildPageRule,
  buildPrintCss,
  cssStringLiteral,
  pageNumberContent,
  parseHeadingBreakLevels,
  runningHeaderBox,
} from "./css";

const opts = (over: Partial<PrintOptions> = {}): PrintOptions => ({
  ...DEFAULT_PRINT_OPTIONS,
  ...over,
});

const INK = { font: "Charter, serif", accent: "#8a4b2b" };

describe("cssStringLiteral", () => {
  it("wraps in quotes and escapes quotes and backslashes", () => {
    expect(cssStringLiteral('a "b" \\ c')).toBe('"a \\"b\\" \\\\ c"');
  });

  it("flattens newlines and tabs to spaces so the declaration stays valid", () => {
    expect(cssStringLiteral("line1\nline2\tend")).toBe('"line1 line2 end"');
  });
});

describe("pageNumberContent", () => {
  it("returns null when disabled", () => {
    expect(pageNumberContent("none")).toBeNull();
  });

  it("uses counter(page) for the plain and page-n formats", () => {
    expect(pageNumberContent("plain")).toBe("counter(page)");
    expect(pageNumberContent("page-n")).toBe('"Page " counter(page)');
  });

  it("includes the total for n-of-total", () => {
    expect(pageNumberContent("n-of-total")).toBe('counter(page) " / " counter(pages)');
  });
});

describe("buildPageRule", () => {
  it("emits size, orientation and margin from the options", () => {
    const css = buildPageRule(opts({ pageSize: "Letter", landscape: true, margins: "wide" }), "", INK);
    expect(css).toContain("size: letter landscape;");
    expect(css).toContain("margin: 32mm;");
  });

  it("adds a page-number margin box at the chosen position", () => {
    const css = buildPageRule(opts({ pageNumbers: "page-n", pageNumberPosition: "bottom-right" }), "", INK);
    expect(css).toContain("@bottom-right {");
    expect(css).toContain('content: "Page " counter(page);');
  });

  it("emits concrete ink (not var()) into the margin box, since @page can't see element-scoped vars", () => {
    const css = buildPageRule(opts({ pageNumbers: "plain" }), "", INK);
    expect(css).toContain("color: #8a4b2b;");
    expect(css).toContain("font-family: Charter, serif;");
    expect(css).not.toContain("var(--vzd-print");
  });

  it("omits the page-number box entirely when numbers are off", () => {
    const css = buildPageRule(opts({ pageNumbers: "none" }), "Doc", INK);
    expect(css).not.toContain("counter(page)");
  });

  it("prints the note title in a running-header box that avoids the number box", () => {
    const css = buildPageRule(
      opts({ runningHeader: true, pageNumbers: "plain", pageNumberPosition: "top-center" }),
      'My "Great" Note',
      INK,
    );
    // number takes @top-center → header must move to @top-right
    expect(css).toContain("@top-center {");
    expect(css).toContain("@top-right {");
    expect(css).toContain('content: "My \\"Great\\" Note";');
  });

  it("drops the running header when the title is blank", () => {
    const css = buildPageRule(opts({ runningHeader: true }), "   ", INK);
    expect(css).not.toContain("@top-center");
  });
});

describe("runningHeaderBox", () => {
  it("keeps clear of a top page number", () => {
    expect(runningHeaderBox("top-center")).toBe("@top-right");
    expect(runningHeaderBox("top-right")).toBe("@top-left");
  });

  it("defaults to the top centre when the number is at the bottom", () => {
    expect(runningHeaderBox("bottom-center")).toBe("@top-center");
  });
});

describe("parseHeadingBreakLevels", () => {
  it("maps # runs to levels, comma-separated", () => {
    expect(parseHeadingBreakLevels("#,##")).toEqual([1, 2]);
    expect(parseHeadingBreakLevels("###")).toEqual([3]);
  });
  it("ignores whitespace, dedupes and sorts", () => {
    expect(parseHeadingBreakLevels(" ## , # , ## ")).toEqual([1, 2]);
  });
  it("drops non-# tokens and empty input", () => {
    expect(parseHeadingBreakLevels("")).toEqual([]);
    expect(parseHeadingBreakLevels("#, h2, 2, #######")).toEqual([1]);
  });
});

describe("buildHeadingBreaks", () => {
  it("is empty when the field is blank", () => {
    expect(buildHeadingBreaks(opts({ headingBreakLevels: "" }))).toBe("");
  });

  it("forces the named levels (but not the first) onto a new page", () => {
    const css = buildHeadingBreaks(opts({ headingBreakLevels: "#,##" }));
    expect(css).toContain(".vzd-print h1:not(:first-child) { break-before: page; }");
    expect(css).toContain(".vzd-print h2:not(:first-child) { break-before: page; }");
    expect(css).not.toContain("h3");
  });
});

describe("buildPrintCss", () => {
  it("wires the template accent override through to the root vars", () => {
    const template = getPrintTemplate("manuscript");
    const css = buildPrintCss(template, opts({ templateValues: { accent: "#ff0000" } }), "T");
    // Accent is emitted concretely (no var()), e.g. on links.
    expect(css).toContain(".vzd-print a { color: #ff0000; }");
    expect(css).not.toContain("var(--vzd-print");
  });

  it("keeps Vizardry canvases from splitting across pages", () => {
    const css = buildPrintCss(getPrintTemplate("minimal"), opts(), "T");
    expect(css).toContain(".vzd-print .vizardry-root,");
    expect(css).toContain("break-inside: avoid;");
  });

  it("falls back to the first template for an unknown id and still builds", () => {
    const css = buildPrintCss(getPrintTemplate("does-not-exist"), opts(), "T");
    expect(css).toContain("@page {");
    expect(css).toContain(".vzd-print {");
    expect(css).toContain("font-family:");
  });

  it("turns hr into a page break (no line) only when hrPageBreak is on", () => {
    expect(buildPrintCss(getPrintTemplate("minimal"), opts({ hrPageBreak: false }), "T"))
      .not.toContain(".vzd-print hr {");
    const on = buildPrintCss(getPrintTemplate("minimal"), opts({ hrPageBreak: true }), "T");
    expect(on).toContain(".vzd-print hr { border: 0; height: 0; margin: 0; break-after: page; }");
  });

  it("hides the title block only when showTitle is off", () => {
    const shown = buildPrintCss(getPrintTemplate("minimal"), opts({ showTitle: true }), "T");
    expect(shown).not.toContain(".vzd-print-title { display: none; }");
    const hidden = buildPrintCss(getPrintTemplate("minimal"), opts({ showTitle: false }), "T");
    expect(hidden).toContain(".vzd-print .vzd-print-title { display: none; }");
  });
});
