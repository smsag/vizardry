/**
 * User-facing print/export options — the state behind the export dialog.
 *
 * There are two tiers of settings (mirroring iA Writer):
 *  - these fixed, template-agnostic options (page size, margins, page numbers…)
 *  - per-template declared options (see `PrintTemplate.options` in ./templates),
 *    whose chosen values live in `templateValues` here.
 *
 * This module is intentionally free of any `obsidian` / DOM imports so the CSS
 * and HTML builders that consume it stay pure and unit-testable.
 */

export type PageSize = "A4" | "A5" | "Letter" | "Legal";

export type MarginPreset = "narrow" | "normal" | "wide";

/** How a running page number is rendered, or "none" to omit it entirely. */
export type PageNumberFormat = "none" | "plain" | "page-n" | "n-of-total";

/** Which page-margin box the running page number sits in. */
export type PageNumberPosition =
  | "bottom-center"
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-center";

export interface PrintOptions {
  /** id of the chosen `PrintTemplate` (see ./templates). */
  templateId: string;
  pageSize: PageSize;
  landscape: boolean;
  margins: MarginPreset;
  /**
   * Which heading levels start on a fresh page, in Markdown notation:
   * `#` = H1, `##` = H2, …, comma-separated (e.g. `#,##`). Empty = none.
   */
  headingBreakLevels: string;
  /** Treat a horizontal rule (`---`) as a page break instead of drawing it. */
  hrPageBreak: boolean;
  pageNumbers: PageNumberFormat;
  pageNumberPosition: PageNumberPosition;
  /** Repeat the note title in a margin box on every page. */
  runningHeader: boolean;
  /** Render the note title as a heading block at the top of the document. */
  showTitle: boolean;
  /** Values for the chosen template's own declared options (option id → value). */
  templateValues: Record<string, string | boolean>;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  templateId: "manuscript",
  pageSize: "A4",
  landscape: false,
  margins: "normal",
  headingBreakLevels: "",
  hrPageBreak: false,
  pageNumbers: "page-n",
  pageNumberPosition: "bottom-center",
  runningHeader: false,
  showTitle: true,
  templateValues: {},
};

/** Margin preset → physical page margin in millimetres. */
export const MARGIN_MM: Record<MarginPreset, number> = {
  narrow: 12,
  normal: 20,
  wide: 32,
};

/** CSS `size` page keyword for each supported page size. */
export const PAGE_SIZE_KEYWORD: Record<PageSize, string> = {
  A4: "A4",
  A5: "A5",
  Letter: "letter",
  Legal: "legal",
};

/**
 * Merge a possibly-partial, possibly-stale persisted options object onto the
 * defaults so older saved settings (missing newly-added keys) stay valid.
 */
export function normalizePrintOptions(raw: Partial<PrintOptions> | undefined): PrintOptions {
  const merged = {
    ...DEFAULT_PRINT_OPTIONS,
    ...(raw ?? {}),
    // templateValues is a nested object — a shallow spread would drop the
    // defaults' (empty) object only when raw omits it, which is fine, but guard
    // against a null slipping through from hand-edited data.json.
    templateValues: { ...(raw?.templateValues ?? {}) },
  };

  // Migrate 0.64.0's separate h1/h2 booleans to the Markdown-notation field.
  if (raw && merged.headingBreakLevels === "") {
    const legacy = raw as { h1PageBreak?: boolean; h2PageBreak?: boolean };
    const levels: string[] = [];
    if (legacy.h1PageBreak) levels.push("#");
    if (legacy.h2PageBreak) levels.push("##");
    if (levels.length) merged.headingBreakLevels = levels.join(",");
  }
  return merged;
}
