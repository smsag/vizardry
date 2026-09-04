/**
 * Generates the print stylesheet from a template + options.
 *
 * The output is consumed by Paged.js (see ./export), which polyfills the CSS
 * Paged Media features Chromium's own `window.print()` ignores — chiefly the
 * `@page` margin boxes that carry page numbers and running headers, and
 * `counter(page)` / `counter(pages)`.
 *
 * Everything here is a pure string builder: no `obsidian`, no DOM. That keeps
 * the page-number and page-break logic — the parts most worth getting right —
 * directly unit-testable.
 */

import type {
  PageNumberFormat,
  PageNumberPosition,
  PrintOptions,
} from "./options";
import { MARGIN_MM, PAGE_SIZE_KEYWORD } from "./options";
import type { PrintTemplate, PrintVars } from "./templates";
import { resolveTemplateVars } from "./templates";

/** Escape a string for use as a CSS `content:` string literal. */
export function cssStringLiteral(value: string): string {
  // Backslashes first, then double quotes; drop control chars that would break
  // the declaration (a stray newline in a title, say).
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n\t]/g, " ");
  return `"${escaped}"`;
}

/** The `content` value for a page number in the given format, or null for "none". */
export function pageNumberContent(format: PageNumberFormat): string | null {
  switch (format) {
    case "none":
      return null;
    case "plain":
      return "counter(page)";
    case "page-n":
      return '"Page " counter(page)';
    case "n-of-total":
      return 'counter(page) " / " counter(pages)';
  }
}

/** Map a page-number position to its `@page` margin-box at-rule name. */
export const MARGIN_BOX: Record<PageNumberPosition, string> = {
  "bottom-center": "@bottom-center",
  "bottom-right": "@bottom-right",
  "bottom-left": "@bottom-left",
  "top-right": "@top-right",
  "top-center": "@top-center",
};

/**
 * Choose a margin box for the running header that does not collide with the
 * page number's box. Header prefers a top box; if the page number already
 * occupies it, the header moves to the opposite top corner (or the top-left
 * when the number sits bottom).
 */
export function runningHeaderBox(numberPos: PageNumberPosition): string {
  switch (numberPos) {
    case "top-center":
      return "@top-right";
    case "top-right":
      return "@top-left";
    default:
      return "@top-center";
  }
}

/** Concrete font/ink emitted into `@page` margin boxes. */
export interface MarginInk {
  font: string;
  accent: string;
}

/**
 * Build the `@page` rule, including any page-number and running-header boxes.
 *
 * `ink` carries *resolved* font/colour values, deliberately not `var(--…)`:
 * the print custom properties are scoped to the `.vzd-print` element, and
 * element-scoped custom properties are not visible inside `@page` margin-box
 * context, so a `var()` there would silently fall back to the initial value.
 */
export function buildPageRule(options: PrintOptions, title: string, ink: MarginInk): string {
  const sizeKeyword = PAGE_SIZE_KEYWORD[options.pageSize];
  const orientation = options.landscape ? "landscape" : "portrait";
  const marginMm = MARGIN_MM[options.margins];

  const marginBoxes: string[] = [];

  const numberContent = pageNumberContent(options.pageNumbers);
  const numberBox = MARGIN_BOX[options.pageNumberPosition];
  if (numberContent) {
    marginBoxes.push(
      `  ${numberBox} {\n` +
        `    content: ${numberContent};\n` +
        `    font-family: ${ink.font};\n` +
        `    font-size: 9pt;\n` +
        `    color: ${ink.accent};\n` +
        `  }`,
    );
  }

  if (options.runningHeader && title.trim()) {
    // Keep the header off the same box as the page number.
    let headerBox = runningHeaderBox(options.pageNumberPosition);
    if (numberContent && headerBox === numberBox) headerBox = "@top-left";
    marginBoxes.push(
      `  ${headerBox} {\n` +
        `    content: ${cssStringLiteral(title.trim())};\n` +
        `    font-family: ${ink.font};\n` +
        `    font-size: 9pt;\n` +
        `    color: ${ink.accent};\n` +
        `  }`,
    );
  }

  const boxes = marginBoxes.length ? "\n" + marginBoxes.join("\n") + "\n" : "";
  return (
    `@page {\n` +
    `  size: ${sizeKeyword} ${orientation};\n` +
    `  margin: ${marginMm}mm;\n` +
    boxes +
    `}`
  );
}

/**
 * Parse the Markdown-notation heading-break field into distinct levels.
 * `#` = 1, `##` = 2, …, comma-separated (`#,##` → [1, 2]). Whitespace is
 * ignored; tokens that aren't a run of 1–6 `#` are dropped; duplicates are
 * collapsed and the result is sorted.
 */
export function parseHeadingBreakLevels(input: string): number[] {
  const levels = new Set<number>();
  for (const token of input.split(",")) {
    const t = token.trim();
    if (/^#{1,6}$/.test(t)) levels.add(t.length);
  }
  return Array.from(levels).sort((a, b) => a - b);
}

/** Build the heading page-break rules from the `headingBreakLevels` field. */
export function buildHeadingBreaks(options: PrintOptions): string {
  // `break-before: page` is the modern property; Paged.js honours it. The
  // `:not(:first-child)` guard stops the very first heading forcing a blank
  // leading page.
  return parseHeadingBreakLevels(options.headingBreakLevels)
    .map((n) => `.vzd-print h${n}:not(:first-child) { break-before: page; }`)
    .join("\n");
}

/**
 * The base rules shared by every template — typography plus the "keep visuals
 * whole" rules that stop Vizardry canvases and images being sliced across a
 * page boundary.
 *
 * Values are emitted *concretely*, not via `var(--…)`. CSS custom properties do
 * not resolve reliably across all of Paged.js's cloned/chunked page contexts —
 * the first page in particular ended up without the variable and fell back to
 * the browser default serif — so the whole sheet was inconsistent. Concrete
 * values (like the resolved ink already used in the @page margin boxes) apply
 * uniformly on every page.
 */
function baseRules(v: PrintVars): string {
  return `.vzd-print {
  font-family: ${v.font};
  font-size: ${v.fontSize};
  line-height: ${v.lineHeight};
  color: ${v.color};
}
.vzd-print .vzd-print-body {
  max-width: ${v.measure};
  margin: 0 auto;
}
.vzd-print h1, .vzd-print h2, .vzd-print h3,
.vzd-print h4, .vzd-print h5, .vzd-print h6 {
  font-family: ${v.headingFont};
  color: ${v.headingColor};
  line-height: 1.2;
}
/* Don't strand a heading at the foot of a page. */
.vzd-print h1, .vzd-print h2, .vzd-print h3 { break-after: avoid; }
.vzd-print p { orphans: 2; widows: 2; }
.vzd-print a { color: ${v.accent}; }
.vzd-print code, .vzd-print pre { font-family: ${v.monoFont}; }
.vzd-print pre { break-inside: avoid; white-space: pre-wrap; }
/* Vizardry canvases, Mermaid SVGs and images print whole and never overflow. */
.vzd-print .vizardry-root,
.vzd-print .mermaid,
.vzd-print svg,
.vzd-print img,
.vzd-print table,
.vzd-print blockquote {
  break-inside: avoid;
  max-width: 100%;
}
.vzd-print .vizardry-root svg,
.vzd-print .mermaid svg { height: auto; }
/* Visualizations are centered and scaled to 75%. transform (not zoom) leaves
   the layout box untouched, so Paged.js measures the real height and pagination
   is unaffected; transform-origin centres the shrunk diagram horizontally. */
.vzd-print .vizardry-root,
.vzd-print .mermaid {
  transform: scale(0.75);
  transform-origin: top center;
}
/* Zebra-stripe table body rows for readability, in every template. The
   print-color-adjust is required — Chromium drops backgrounds when printing
   unless it's forced. */
.vzd-print table { border-collapse: collapse; }
.vzd-print tbody tr:nth-child(even) {
  background: #e6e6e6;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}`;
}

/**
 * Full print stylesheet for a template + options + note title.
 *
 * Order matters: root vars first (so BASE_RULES can read them), then the
 * @page rule, heading breaks, and finally the template's own extra CSS so a
 * template can override anything above it.
 */
export function buildPrintCss(
  template: PrintTemplate,
  options: PrintOptions,
  title: string,
): string {
  const vars = resolveTemplateVars(template, options);
  const parts = [
    baseRules(vars),
    buildPageRule(options, title, { font: vars.font, accent: vars.accent }),
    buildHeadingBreaks(options),
  ];
  // The title block is always present in the rendered content; toggle its
  // visibility here so switching it on/off only re-paginates, never re-renders.
  if (!options.showTitle) parts.push(".vzd-print .vzd-print-title { display: none; }");
  // Treat a horizontal rule as a page break: don't draw the line, break after it.
  if (options.hrPageBreak) {
    parts.push(".vzd-print hr { border: 0; height: 0; margin: 0; break-after: page; }");
  }
  if (template.css) parts.push(template.css);
  return parts.filter(Boolean).join("\n\n");
}
