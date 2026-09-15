/**
 * Column of the first non-whitespace character on a line, or -1 for a blank
 * or whitespace-only line — the same contract as `line.search(/\S/)`, which
 * every parser and edit helper used to call directly.
 *
 * The difference is the tab. `search` counts a tab as one column, so a note
 * written with Obsidian's default "indent using tabs" mixed with a pasted
 * space-indented line misparsed: `\tB` sat at column 1 and `    C` at column
 * 4, so C became a grandchild (or "indent of 1 is not a multiple of 4"). A
 * tab counts as TAB_WIDTH columns here, Obsidian's default tab size, so the
 * two spellings of the same visual indent agree.
 */
export const TAB_WIDTH = 4;

export function indentOf(line: string): number {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charCodeAt(i);
    if (ch === 32) col++;                 // space
    else if (ch === 9) col += TAB_WIDTH;  // tab
    else if (ch === 13 || ch === 10) return -1; // line ending: nothing on it
    else if (ch === 0xa0 || ch === 0xfeff) col++; // nbsp / BOM: whitespace to /\S/ too
    else return col;
  }
  return -1;
}
