/**
 * Shared text-measurement helpers for foreignObject-hosted node boxes.
 *
 * Both the Node Map (renderer/nodemap.ts) and the Opportunity Solution Tree
 * (renderer/tree.ts, lane mode) render node bodies as wrapped HTML inside an
 * SVG <foreignObject>, then need the box HEIGHT up front so the layout can
 * place the box before the DOM exists. There is no reliable way to measure
 * real text metrics at layout time (the nodes aren't in the document yet, and
 * tests run without a layout engine), so both estimate wrapped line counts
 * from an average character width — the same approach nodemap has shipped
 * with. Centralising it here keeps the two renderers consistent.
 */

/** Average glyph advance in px used for the wrap estimate. */
export const BOX_CHAR_W = 7;

/**
 * Estimate how many characters fit on one line of `innerW` pixels.
 * `charW` is the average glyph width; `min` clamps the result so a very
 * narrow box still wraps at a sane width rather than one char per line.
 */
export function estimateCharsPerLine(
  innerW: number,
  { charW = BOX_CHAR_W, min = 8 }: { charW?: number; min?: number } = {},
): number {
  return Math.max(min, Math.floor(innerW / (charW - 1)));
}

/**
 * Estimate the number of wrapped lines `text` occupies at `charsPerLine`.
 * Honours explicit "\n" breaks (each paragraph wraps independently) and never
 * returns less than 1.
 */
export function wrappedLineCount(text: string, charsPerLine: number): number {
  const cpl = Math.max(1, charsPerLine);
  let lines = 0;
  for (const para of text.split("\n")) lines += Math.max(1, Math.ceil(para.length / cpl));
  return Math.max(1, lines);
}
