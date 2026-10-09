/**
 * Collapses a grid canvas's CSS grid when some of its blocks are left out of
 * the source, so the blocks that are there fill the canvas instead of
 * sitting next to empty holes.
 *
 * Works on the framework's own `grid-template-areas` and track lists:
 *   1. An absent block's cells become empty (`.`).
 *   2. Rows and columns left completely empty are dropped, together with
 *      their tracks (`"sw wk" / ". ."` → one row).
 *   3. Each present block grows into empty cells beside it, sideways first,
 *      then up and down, but only where its whole edge can move, so every
 *      area stays the rectangle CSS grid requires
 *      (`"sw ." / ". th"` → `"sw sw" / "th th"`).
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

/** Splits a track list on top-level whitespace and expands `repeat(n, …)`. */
export function expandTracks(list: string): string[] | null {
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) { tokens.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  if (depth !== 0) return null;

  const out: string[] = [];
  for (const tok of tokens) {
    const m = /^repeat\(\s*(\d+)\s*,(.*)\)$/s.exec(tok);
    if (!m) { out.push(tok); continue; }
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
  const outCells = marked.filter((_, ri) => keepRows[ri]).map((r) => r.filter((_, ci) => keepCols[ci]));
  const width = outCells[0]!.length;

  // 3. Grow each present block into the empty cells beside it (sideways
  //    first, then up and down), but only where its whole edge can move, so
  //    every area stays a rectangle.
  const height = outCells.length;
  const bounds = (area: string): { r0: number; r1: number; c0: number; c1: number } | null => {
    let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    outCells.forEach((r, ri) => r.forEach((a, ci) => {
      if (a !== area) return;
      r0 = Math.min(r0, ri); r1 = Math.max(r1, ri);
      c0 = Math.min(c0, ci); c1 = Math.max(c1, ci);
    }));
    return r0 === Infinity ? null : { r0, r1, c0, c1 };
  };
  const span = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  for (const vertical of [false, true]) {
    for (const area of present) {
      const b = bounds(area);
      if (!b) continue;
      if (!vertical) {
        const rowsOf = span(b.r0, b.r1);
        const free = (ci: number): boolean => rowsOf.every((ri) => outCells[ri]![ci] === EMPTY);
        while (b.c1 + 1 < width && free(b.c1 + 1)) { b.c1++; rowsOf.forEach((ri) => { outCells[ri]![b.c1] = area; }); }
        while (b.c0 - 1 >= 0 && free(b.c0 - 1)) { b.c0--; rowsOf.forEach((ri) => { outCells[ri]![b.c0] = area; }); }
      } else {
        const colsOf = span(b.c0, b.c1);
        const free = (ri: number): boolean => colsOf.every((ci) => outCells[ri]![ci] === EMPTY);
        while (b.r1 + 1 < height && free(b.r1 + 1)) { b.r1++; colsOf.forEach((ci) => { outCells[b.r1]![ci] = area; }); }
        while (b.r0 - 1 >= 0 && free(b.r0 - 1)) { b.r0--; colsOf.forEach((ci) => { outCells[b.r0]![ci] = area; }); }
      }
    }
  }

  return {
    template: outCells.map((r) => `"${r.join(" ")}"`).join(" "),
    columns: cols.filter((_, ci) => keepCols[ci]).join(" "),
    rows: rows.filter((_, ri) => keepRows[ri]).join(" "),
  };
}
