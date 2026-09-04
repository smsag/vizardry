/**
 * Print templates — iA-Writer-style export "skins".
 *
 * A template is a bundle of CSS custom properties (the typographic skin,
 * consumed by the generated base CSS in ./css) plus an optional block of extra
 * CSS and an optional set of *declared options* that surface as controls in the
 * export dialog. New templates are added here as plain data — no `obsidian`
 * import, so this stays unit-testable and could later be sourced from a vault
 * folder of `*.viztemplate` bundles without changing the CSS pipeline.
 */

import type { PrintOptions } from "./options";

/**
 * A declared, template-specific option surfaced in the export dialog.
 *
 * An option's `id` MUST name a `PrintVars` key (e.g. "accent", "font",
 * "fontSize"): its chosen value overrides that style variable at render time
 * (see `resolveTemplateVars`). Both variants carry a string value, so every
 * declared option actually affects the output — there is no write-only knob.
 */
export type TemplateOption =
  | { id: PrintVarKey; label: string; type: "color"; default: string }
  | {
      id: PrintVarKey;
      label: string;
      type: "select";
      default: string;
      choices: { value: string; label: string }[];
    };

export interface PrintTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * CSS custom properties injected on the print root. These are the knobs the
   * base CSS reads — see ./css. Every template must define the full set so the
   * generated CSS never falls back to an undefined variable.
   */
  vars: PrintVars;
  /** Extra raw CSS appended after the generated base CSS (advanced skinning). */
  css?: string;
  /** Options this template contributes to the dialog. */
  options?: TemplateOption[];
}

/** The complete set of CSS variables every template must supply. */
export interface PrintVars {
  /** Body font stack. */
  font: string;
  /** Heading font stack. */
  headingFont: string;
  /** Monospace stack for code. */
  monoFont: string;
  /** Base body font size, e.g. "11pt". */
  fontSize: string;
  /** Body line height (unitless), e.g. "1.5". */
  lineHeight: string;
  /** Body text colour. */
  color: string;
  /** Heading text colour. */
  headingColor: string;
  /** Accent colour (links, rules, page-number ink). */
  accent: string;
  /** Optional max text column width, e.g. "34em" — or "none" to fill the page. */
  measure: string;
}

export type PrintVarKey = keyof PrintVars;

/**
 * Runtime list of the `PrintVars` keys — the set of ids a `TemplateOption` may
 * target. The `satisfies` clause rejects a typo'd key; keep it in sync when
 * adding a var (an unlisted var simply can't be targeted by a template option).
 */
export const PRINT_VAR_KEYS = [
  "font",
  "headingFont",
  "monoFont",
  "fontSize",
  "lineHeight",
  "color",
  "headingColor",
  "accent",
  "measure",
] satisfies PrintVarKey[];

const PRINT_VAR_KEY_SET = new Set<string>(PRINT_VAR_KEYS);

// ── Built-in templates ────────────────────────────────────────────────────────

const MANUSCRIPT: PrintTemplate = {
  id: "manuscript",
  name: "Manuscript",
  description: "Serif body, generous leading — long-form reading and reports.",
  vars: {
    font: 'Charter, "Iowan Old Style", Georgia, "Times New Roman", serif',
    headingFont: 'Charter, "Iowan Old Style", Georgia, serif',
    monoFont: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    fontSize: "11pt",
    lineHeight: "1.55",
    color: "#1a1a1a",
    headingColor: "#111111",
    accent: "#8a4b2b",
    measure: "34em",
  },
  options: [
    { id: "accent", label: "Accent colour", type: "color", default: "#8a4b2b" },
  ],
};

const TECHNICAL: PrintTemplate = {
  id: "technical",
  name: "Technical",
  description: "Sans-serif with tight code blocks — specs, docs, runbooks.",
  vars: {
    font: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    headingFont: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    monoFont: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
    fontSize: "10.5pt",
    lineHeight: "1.45",
    color: "#1f2328",
    headingColor: "#0b1220",
    accent: "#2563eb",
    measure: "none",
  },
  options: [
    { id: "accent", label: "Accent colour", type: "color", default: "#2563eb" },
    {
      id: "fontSize",
      label: "Body size",
      type: "select",
      default: "10.5pt",
      choices: [
        { value: "10pt", label: "Compact" },
        { value: "10.5pt", label: "Normal" },
        { value: "12pt", label: "Comfortable" },
      ],
    },
  ],
};

const MINIMAL: PrintTemplate = {
  id: "minimal",
  name: "Minimal",
  description: "Neutral system font, no flourishes — clean, printer-friendly.",
  vars: {
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headingFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    monoFont: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontSize: "11pt",
    lineHeight: "1.5",
    color: "#000000",
    headingColor: "#000000",
    accent: "#000000",
    measure: "none",
  },
  // Render every visualization in greyscale for the printer-friendly template.
  css: `.vzd-print .vizardry-root, .vzd-print .mermaid { filter: grayscale(1); }`,
};

export const BUILTIN_PRINT_TEMPLATES: readonly PrintTemplate[] = [
  MANUSCRIPT,
  TECHNICAL,
  MINIMAL,
];

/** Look up a template by id, falling back to the first built-in if unknown. */
export function getPrintTemplate(id: string): PrintTemplate {
  return BUILTIN_PRINT_TEMPLATES.find((t) => t.id === id) ?? BUILTIN_PRINT_TEMPLATES[0];
}

/**
 * Resolve a template's effective CSS variables, applying any declared-option
 * overrides the user chose (e.g. an "accent" colour option overrides the
 * template's default `accent`). Unknown option ids are ignored.
 */
export function resolveTemplateVars(template: PrintTemplate, options: PrintOptions): PrintVars {
  const vars: PrintVars = { ...template.vars };
  // Apply every chosen option value that names a style variable. Because a
  // TemplateOption's id is a PrintVarKey, this wires all declared options
  // (accent, a font select, …) — not just a hardcoded "accent".
  for (const [id, value] of Object.entries(options.templateValues)) {
    if (typeof value === "string" && value.trim() && PRINT_VAR_KEY_SET.has(id)) {
      vars[id as PrintVarKey] = value.trim();
    }
  }
  return vars;
}
