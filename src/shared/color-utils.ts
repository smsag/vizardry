/**
 * Colour utility for choosing accessible text colours on tinted backgrounds.
 *
 * Used by renderers that apply `color-mix(in srgb, var(--interactive-accent) X%,
 * var(--background-secondary))` as a header background. The correct text colour
 * (white vs accent-coloured) cannot be determined at stylesheet author time
 * because it depends on the user's chosen accent colour.
 */

/**
 * Returns the relative luminance of a CSS `rgb(r, g, b)` string using the
 * WCAG 2.1 formula, or `null` if the string cannot be parsed.
 */
function luminanceFromRgb(css: string): number | null {
  const m = css.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return null;
  const linearise = (n: number): number => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearise(+m[1]) + 0.7152 * linearise(+m[2]) + 0.0722 * linearise(+m[3]);
}

/** WCAG contrast ratio between two relative luminance values. */
function contrast(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Reads the computed background of `el` and returns the best WCAG-contrast
 * text colour using a 3-step cascade:
 *
 *   1. White (#ffffff)             — if contrast ≥ 4.5 : 1  (dark backgrounds)
 *   2. Accent (--interactive-accent) — if contrast ≥ 3 : 1  (mid-dark, e.g. dark-theme pastels)
 *   3. Normal text (--text-normal) — fallback for light backgrounds with light accents
 *
 * The accent luminance is sampled at runtime by briefly inserting a hidden 1 px
 * probe element so that `getComputedStyle` can resolve `var(--interactive-accent)`
 * in the same document context as the calling element.
 *
 * Pass `svgFill = true` for SVG elements whose background colour is expressed
 * via the `fill` CSS property rather than `background-color`.
 *
 * The element **must be attached to a live document** so that
 * `getComputedStyle` can resolve `color-mix()` values.  If the colour cannot
 * be parsed (e.g. in test environments that do not implement `color-mix`),
 * the function falls back to `"#ffffff"` — the safer choice for headers that
 * carry any accent pigment.
 */
export function bestTextColor(el: Element, svgFill = false): string {
  const cs = getComputedStyle(el);
  const raw = svgFill ? cs.fill : cs.backgroundColor;
  const bgLum = luminanceFromRgb(raw);

  // Fallback when the environment cannot resolve color-mix (e.g. test VMs).
  if (bgLum === null) return "#ffffff";

  // Step 1 — white on dark backgrounds.
  if (contrast(1, bgLum) >= 4.5) return "#ffffff";

  // Step 2 — accent on mid-tone backgrounds, but only if accent itself contrasts.
  // Sample the actual resolved accent colour via a short-lived probe element.
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;" +
    "background-color:var(--interactive-accent);";
  (el.ownerDocument ?? document).body.appendChild(probe);
  const accentRaw = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const accentLum = luminanceFromRgb(accentRaw);
  if (accentLum !== null && contrast(accentLum, bgLum) >= 3) {
    return "var(--interactive-accent)";
  }

  // Step 3 — fall back to the theme's normal text colour (works on any background).
  return "var(--text-normal)";
}
