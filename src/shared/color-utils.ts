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

/**
 * Reads the computed background of `el` and returns the text colour that
 * achieves the highest WCAG contrast:
 *
 *   - `"#ffffff"` (white)  when white reaches ≥ 4.5 : 1 against the background
 *   - `"var(--interactive-accent)"` otherwise (accent-coloured text on a
 *     lightly-tinted background — the existing roadmap / canvas convention)
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
  const lum = luminanceFromRgb(raw);

  // Fallback when the environment cannot resolve color-mix (e.g. test VMs).
  if (lum === null) return "#ffffff";

  // WCAG contrast ratio of white (L=1) against this background.
  const contrastWhite = 1.05 / (lum + 0.05);
  return contrastWhite >= 4.5 ? "#ffffff" : "var(--interactive-accent)";
}
