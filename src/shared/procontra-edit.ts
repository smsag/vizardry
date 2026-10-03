import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";
import { writeFieldLine } from "./field-line";
import { scanProContraLines, splitWeight, type ProContraLine } from "../procontra";
import type { ProContraSide } from "../types/procontra";

/**
 * Source write-back for the Pro / Contra canvas. Every rendered element is one
 * `key: value` line, located by re-running the parser's own line classifier
 * (`scanProContraLines`) over the fence: the Nth `arg` entry is the argument
 * with `ref` N, the Nth `option` entry the option with `ref` N. So a write
 * always targets the line the parser read, whatever the indentation, comments
 * or warning lines around it.
 */

type Scanned = ProContraLine & { abs: number };

interface Block {
  editor: Editor;
  lineStart: number;
  lineEnd: number;
  entries: Scanned[];
}

function openBlock(app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, caller: string): Block | null {
  const resolved = resolveEditor(app, ctx, el, caller);
  if (!resolved) return null;
  const { editor, lineStart, lineEnd } = resolved;
  const lines: string[] = [];
  for (let ln = lineStart + 1; ln < lineEnd; ln++) lines.push(editor.getLine(ln));
  const entries = scanProContraLines(lines).map(e => ({ ...e, abs: e.line + lineStart + 1 }));
  return { editor, lineStart, lineEnd, entries };
}

const args = (b: Block): Scanned[] => b.entries.filter(e => e.kind === "arg");
const options = (b: Block): Scanned[] => b.entries.filter(e => e.kind === "option");

function indentStr(line: string): string {
  return line.match(/^\s*/)?.[0] ?? "";
}

/**
 * `<indent><key>: <text>[ | w]`. The weight suffix is omitted at the default 1
 * — unless the text itself ends in `| <integer>`, which the parser would
 * otherwise read back as the weight (so "Plan B | 2" stays text).
 */
export function formatArg(indent: string, key: string, text: string, weight: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const ambiguous = splitWeight(clean).text !== clean;
  return `${indent}${key}: ${clean}${weight > 1 || ambiguous ? ` | ${weight}` : ""}`;
}

/** The key as written on the line (`pro`, `con`, `contra`, any case). */
function rawKey(line: string): string {
  return line.trim().slice(0, line.trim().indexOf(":")).trim();
}

function replaceLine(editor: Editor, ln: number, text: string): void {
  editor.replaceRange(text, { line: ln, ch: 0 }, { line: ln, ch: editor.getLine(ln).length });
}

function deleteLine(editor: Editor, ln: number): void {
  editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
}

function insertAfter(editor: Editor, ln: number, text: string): void {
  editor.replaceRange(`\n${text}`, { line: ln, ch: editor.getLine(ln).length });
}

/** Last non-blank line inside the fence (or the opening fence itself). */
function lastContentLine(b: Block): number {
  let ln = b.lineEnd - 1;
  while (ln > b.lineStart && b.editor.getLine(ln).trim() === "") ln--;
  return ln;
}

/** Rewrites one argument line through `edit`. Returns false if unavailable. */
function rewriteArg(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, caller: string, ref: number,
  edit: (cur: { indent: string; key: string; text: string; weight: number }) => { key: string; text: string; weight: number },
): boolean {
  const b = openBlock(app, ctx, el, caller);
  const entry = b && args(b)[ref];
  if (!b || !entry) return false;
  const line = b.editor.getLine(entry.abs);
  const key = rawKey(line);
  const { text, weight } = splitWeight(line.trim().slice(line.trim().indexOf(":") + 1));
  const next = edit({ indent: indentStr(line), key, text, weight });
  editorWrite(() => replaceLine(b.editor, entry.abs, formatArg(indentStr(line), next.key, next.text, next.weight)), el);
  return true;
}

export function writeProContraArgText(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, ref: number, text: string,
): boolean {
  return rewriteArg(app, ctx, el, "writeProContraArgText", ref, cur => ({ ...cur, text }));
}

export function writeProContraArgWeight(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, ref: number, weight: number,
): boolean {
  return rewriteArg(app, ctx, el, "writeProContraArgWeight", ref, cur => ({ ...cur, weight }));
}

/** Moves an argument to the other column by flipping its keyword. */
export function flipProContraArg(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, ref: number,
): boolean {
  return rewriteArg(app, ctx, el, "flipProContraArg", ref, cur => ({
    ...cur, key: cur.key.toLowerCase() === "pro" ? "con" : "pro",
  }));
}

export function removeProContraArg(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, ref: number,
): boolean {
  const b = openBlock(app, ctx, el, "removeProContraArg");
  const entry = b && args(b)[ref];
  if (!b || !entry) return false;
  editorWrite(() => deleteLine(b.editor, entry.abs), el);
  return true;
}

/**
 * Adds an argument to an option (`optionRef` -1 = the implicit option). It goes
 * after the option's last argument on the same side, else after its last
 * argument, else straight under the `option:` line — so the source stays
 * grouped the way it renders.
 */
export function insertProContraArg(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  optionRef: number, side: ProContraSide, text: string,
): boolean {
  const b = openBlock(app, ctx, el, "insertProContraArg");
  if (!b) return false;
  const opts = options(b);
  const head = optionRef >= 0 ? opts[optionRef] : undefined;
  if (optionRef >= 0 && !head) return false;

  // The option's span: from its `option:` line (or the fence) to the next one.
  const from = head ? head.abs : b.lineStart;
  const nextOpt = opts.find(o => o.abs > from);
  const to = nextOpt ? nextOpt.abs : b.lineEnd;
  const own = args(b).filter(a => a.abs > from && a.abs < to);
  const anchor = own.filter(a => a.kind === "arg" && a.side === side).at(-1) ?? own.at(-1);

  let after: number;
  let indent: string;
  if (anchor) {
    after = anchor.abs;
    indent = indentStr(b.editor.getLine(anchor.abs));
  } else if (head) {
    after = head.abs;
    indent = `${indentStr(b.editor.getLine(head.abs))}  `;
  } else {
    // The implicit option of an empty board: no named option follows (the
    // renderer only shows an empty implicit option when there are none).
    after = lastContentLine(b);
    indent = "";
  }
  editorWrite(() => insertAfter(b.editor, after, formatArg(indent, side, text, 1)), el);
  return true;
}

/**
 * Renames an option. When it is the chosen option (`chosen`), the effective
 * `decision:` follows along — only then, so renaming a same-named sibling
 * never moves the decision. Naming the implicit option (`ref` -1) inserts an
 * `option:` line above its first argument and indents its arguments under it.
 */
export function renameProContraOption(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  ref: number, name: string, chosen: boolean,
): boolean {
  const b = openBlock(app, ctx, el, "renameProContraOption");
  if (!b) return false;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const decision = chosen ? b.entries.filter(e => e.kind === "decision").at(-1) : undefined;

  if (ref >= 0) {
    const head = options(b)[ref];
    if (!head) return false;
    const line = b.editor.getLine(head.abs);
    editorWrite(() => {
      // In-line rewrites only, so no line number shifts between them.
      replaceLine(b.editor, head.abs, `${indentStr(line)}option: ${clean}`);
      if (decision) replaceLine(b.editor, decision.abs, `${indentStr(b.editor.getLine(decision.abs))}decision: ${clean}`);
    }, el);
    return true;
  }

  const firstOpt = options(b)[0];
  const implicit = args(b).filter(a => !firstOpt || a.abs < firstOpt.abs);
  if (implicit.length === 0) return false;
  editorWrite(() => {
    for (const a of [...implicit].reverse()) {
      const line = b.editor.getLine(a.abs);
      if (indentStr(line) === "") replaceLine(b.editor, a.abs, `  ${line}`);
    }
    b.editor.replaceRange(`option: ${clean}\n`, { line: implicit[0].abs, ch: 0 });
  }, el);
  return true;
}

/** Appends a new, empty `option:` after the last option block. */
export function insertProContraOption(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, name: string,
): boolean {
  const b = openBlock(app, ctx, el, "insertProContraOption");
  if (!b) return false;
  const last = b.entries.filter(e => e.kind === "option" || e.kind === "arg").at(-1);
  const after = last ? last.abs : lastContentLine(b);
  editorWrite(() => insertAfter(b.editor, after, `option: ${name.replace(/\s+/g, " ").trim()}`), el);
  return true;
}

/** Deletes an `option:` line together with its argument lines. */
export function removeProContraOption(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement, ref: number,
): boolean {
  const b = openBlock(app, ctx, el, "removeProContraOption");
  if (!b) return false;
  const opts = options(b);
  let doomed: Scanned[];
  if (ref >= 0) {
    const head = opts[ref];
    if (!head) return false;
    const next = opts[ref + 1];
    doomed = [head, ...args(b).filter(a => a.abs > head.abs && (!next || a.abs < next.abs))];
  } else {
    doomed = args(b).filter(a => !opts[0] || a.abs < opts[0].abs);
  }
  if (doomed.length === 0) return false;
  editorWrite(() => {
    for (const e of [...doomed].sort((x, y) => y.abs - x.abs)) deleteLine(b.editor, e.abs);
  }, el);
  return true;
}

/**
 * Upserts (or, when `value` is empty, removes every) `question:` / `decision:`
 * line. A new question goes above the options, right under the title; a new
 * decision goes at the end.
 */
export function writeProContraField(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  key: "question" | "decision", value: string,
): boolean {
  const b = openBlock(app, ctx, el, "writeProContraField");
  if (!b) return false;
  const matches = b.entries.filter(e => e.kind === key).map(e => e.abs);
  editorWrite(() => writeFieldLine(b.editor, matches, key, value, key === "decision" ? lastContentLine(b) : afterChrome(b)), el);
  return true;
}

/** The last of the leading type/title/collapsed lines (or the opening fence). */
function afterChrome(b: Block): number {
  let after = b.lineStart;
  for (let ln = b.lineStart + 1; ln < b.lineEnd; ln++) {
    const line = b.editor.getLine(ln).trim();
    const k = line.split(":")[0].trim().toLowerCase();
    if (k === "type" || k === "title" || k === "collapsed") after = ln;
    else if (line !== "") break;
  }
  return after;
}
