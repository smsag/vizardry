import type { Editor } from "obsidian";

/**
 * Writes a single-value `key: value` field line — the upsert shared by the
 * canvases whose header/fields are one line each (Test Card, Pro / Contra).
 *
 * `matches` are the absolute lines that currently hold the field, in source
 * order; parsers read the last one. A non-empty value rewrites that last line
 * (keeping its indentation), or inserts a new line after `insertAfter` when
 * there is none. An empty value removes every match: removing only the last
 * would promote an earlier duplicate to the effective value, so a "clear"
 * would surface a stale one instead.
 *
 * Call inside `editorWrite`.
 */
export function writeFieldLine(
  editor: Editor,
  matches: number[],
  key: string,
  value: string,
  insertAfter: number,
): void {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) {
    // Bottom-up, so earlier line numbers stay valid.
    for (const ln of [...matches].sort((a, b) => b - a)) {
      editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
    }
    return;
  }
  const target = matches.at(-1);
  if (target !== undefined) {
    const line = editor.getLine(target);
    const indent = line.match(/^\s*/)?.[0] ?? "";
    editor.replaceRange(`${indent}${key}: ${clean}`, { line: target, ch: 0 }, { line: target, ch: line.length });
  } else {
    editor.replaceRange(`\n${key}: ${clean}`, { line: insertAfter, ch: editor.getLine(insertAfter).length });
  }
}
