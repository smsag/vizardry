/**
 * Collapses a grid canvas's CSS grid when some of its blocks are left out of
 * the source, so the blocks that are there fill the canvas instead of
 * sitting next to empty holes.
 *
 * Works on the framework's own `grid-template-areas` and track lists:
 *   1. An absent block's cells become empty (`.`).
 *   2. Rows and columns left completely empty are dropped, together with
 *      their tracks (`"sw wk" / ". ."` → one row).
 *   3. Each present block grows into empty cells beside it, but only where
 *      its whole edge can move, so every area stays the rectangle CSS grid
 *      requires (`"sw ." / ". th"` → `"sw sw" / "th th"`). Both growth
 *      orders (sideways first, up-and-down first) are tried and the one that
 *      leaves fewer empty cells wins.
 *
 * If the template or track lists can't be read, the layout is returned
 * unchanged: holes are better than a broken grid.
 */

export interface GridLayout {
  template: string;
  columns: string;
  rows: string;
}

const EMPTY = ".";

/** Splits a track list into one entry per track, expanding `repeat(n, …)`.
 *  Returns null for anything it can't read safely (unbalanced parentheses,
 *  `[line-name]` tokens, `repeat(auto-fill, …)`), so the caller keeps the
 *  layout unchanged rather than emitting a broken track list. */
export function expandTracks(list: string): string[] | null {
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  const end = (): void => { if (cur) { tokens.push(cur); cur = ""; } };
  for (const ch of list.trim()) {
    if (ch === "[" || ch === "]") return null;
    if (ch === "(") depth++;
    if (ch === ")" && --depth < 0) return null;
    if (/\s/.test(ch) && depth === 0) { end(); continue; }
    cur += ch;
    // A function closing at the top level ends its token, even when the next
    // one follows without a space: `repeat(2,1fr)repeat(1,2fr)`.
    if (ch === ")" && depth === 0) end();
  }
  end();
  if (depth !== 0) return null;

  const out: string[] = [];
  for (const tok of tokens) {
    if (!/^repeat\(/i.test(tok)) { out.push(tok); continue; }
    const m = /^repeat\(\s*(\d+)\s*,(.*)\)$/is.exec(tok);
    if (!m) return null; // auto-fill / auto-fit: the track count isn't known
    const inner = expandTracks(m[2]!);
    if (!inner) return null;
    for (let i = 0; i < Number(m[1]); i++) out.push(...inner);
  }
  return out;
}

/** The rows of a `grid-template-areas` string, each as its cell names. */
export function parseTemplate(template: string): string[][] | null {
  const rows = Array.from(template.matchAll(/"([^"]*)"/g), (m) => m[1]!.trim().split(/\s+/));
  if (rows.length === 0) return null;
  const width = rows[0]!.length;
  return rows.every((r) => r.length === width) ? rows : null;
}

type Axis = "rows" | "cols";

/** Grows `area` along `axis` (left/right for "cols", up/down for "rows")
 *  into empty cells, one track at a time, only while its whole edge is
 *  empty, so the area stays a rectangle. Mutates `cells`. */
function grow(cells: string[][], area: string, axis: Axis): void {
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  cells.forEach((r, ri) => r.forEach((a, ci) => {
    if (a !== area) return;
    r0 = Math.min(r0, ri); r1 = Math.max(r1, ri);
    c0 = Math.min(c0, ci); c1 = Math.max(c1, ci);
  }));
  if (r0 === Infinity) return;
  const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // The cells of track `t` along the grown edge: a column for "cols", a row for "rows".
  const edge = (t: number): Array<[number, number]> => axis === "cols"
    ? range(r0, r1).map((ri) => [ri, t] as [number, number])
    : range(c0, c1).map((ci) => [t, ci] as [number, number]);
  const free = (t: number): boolean => edge(t).every(([ri, ci]) => cells[ri]![ci] === EMPTY);
  const claim = (t: number): void => { edge(t).forEach(([ri, ci]) => { cells[ri]![ci] = area; }); };
  let lo = axis === "cols" ? c0 : r0;
  let hi = axis === "cols" ? c1 : r1;
  const limit = axis === "cols" ? cells[0]!.length : cells.length;
  while (hi + 1 < limit && free(hi + 1)) claim(++hi);
  while (lo - 1 >= 0 && free(lo - 1)) claim(--lo);
}

export function collapseGridLayout(layout: GridLayout, present: ReadonlySet<string>): GridLayout {
  const grid = parseTemplate(layout.template);
  const cols = expandTracks(layout.columns);
  const rows = expandTracks(layout.rows);
  if (!grid || !cols || !rows || cols.length !== grid[0]!.length || rows.length !== grid.length) return layout;

  // 1. Absent blocks leave empty cells.
  const marked = grid.map((r) => r.map((a) => (present.has(a) ? a : EMPTY)));

  // 2. Drop rows and columns that are entirely empty, with their tracks.
  const keepRows = marked.map((r) => r.some((a) => a !== EMPTY));
  const keepCols = cols.map((_, ci) => marked.some((r) => r[ci] !== EMPTY));
  if (!keepRows.some(Boolean) || !keepCols.some(Boolean)) return layout;
  const kept = marked.filter((_, ri) => keepRows[ri]).map((r) => r.filter((_, ci) => keepCols[ci]));

  // 3. Grow the present blocks into the empty cells beside them. Which order
  //    fills every gap depends on the framework (sideways first leaves holes
  //    in Lean and Playing to Win, up-and-down first in BMC), so try both and
  //    keep the one with fewer empty cells; sideways wins a tie.
  const orders: Axis[][] = [["cols", "rows"], ["rows", "cols"]];
  let outCells = kept;
  let best = Infinity;
  for (const order of orders) {
    const cells = kept.map((r) => [...r]);
    for (const axis of order) for (const area of present) grow(cells, area, axis);
    const holes = cells.flat().filter((a) => a === EMPTY).length;
    if (holes < best) { best = holes; outCells = cells; }
  }

  return {
    template: outCells.map((r) => `"${r.join(" ")}"`).join(" "),
    columns: cols.filter((_, ci) => keepCols[ci]).join(" "),
    rows: rows.filter((_, ri) => keepRows[ri]).join(" "),
  };
}
