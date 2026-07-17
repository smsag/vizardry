import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import type { NodeMapColor, NodeMapLineStyle, NodeMapLinkDirection } from "../types";

/** Escapes a string for use inside a RegExp. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBoxLine(
  editor: { getLine: (line: number) => string },
  lineStart: number,
  lineEnd: number,
  boxName: string,
): number {
  const re = new RegExp(`^\\s*box:\\s*${escRe(boxName)}\\s*\\[`, "i");
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    if (re.test(editor.getLine(ln))) return ln;
  }
  return -1;
}

/** Range (inclusive) of indented continuation lines directly below `boxLine`,
 *  or null if there are none. */
function findBodyRange(
  editor: { getLine: (line: number) => string },
  boxLine: number,
  lineEnd: number,
): { first: number; last: number } | null {
  let first = -1, last = -1;
  for (let ln = boxLine + 1; ln <= lineEnd; ln++) {
    const line = editor.getLine(ln);
    if (line.trim() === "") break;
    if (line.search(/\S/) === 0) break; // next top-level line
    if (first === -1) first = ln;
    last = ln;
  }
  return first === -1 ? null : { first, last };
}

function resolveUniqueBoxName(
  editor: { getLine: (line: number) => string },
  lineStart: number,
  lineEnd: number,
  baseName: string,
): string {
  const existingNames = new Set<string>();
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const match = editor.getLine(ln).trim().match(/^box:\s*(.*?)\s*\[/i);
    if (!match) continue;
    const name = match[1].trim().toLowerCase();
    if (name) existingNames.add(name);
  }
  const normalizedBase = baseName.trim() || "New Box";
  if (!existingNames.has(normalizedBase.toLowerCase())) return normalizedBase;
  let index = 2;
  while (existingNames.has(`${normalizedBase} ${index}`.toLowerCase())) index++;
  return `${normalizedBase} ${index}`;
}

interface ParsedLinkLine {
  from: string;
  to: string;
  direction: NodeMapLinkDirection;
  label?: string;
  color?: NodeMapColor;
  style: NodeMapLineStyle;
}

/** Best-effort re-parse of an existing `link: ...` line (post "link:" prefix)
 *  for write-back purposes — tolerant of anything the real parser already
 *  accepted, since this only round-trips already-valid source. */
function parseLinkLine(rest: string): ParsedLinkLine | null {
  const trimmedRest = rest.trim();
  const biIdx = trimmedRest.indexOf("<->");
  const dirIdx = trimmedRest.indexOf("->");
  const undirIdx = trimmedRest.indexOf("--");
  let direction: NodeMapLinkDirection;
  let tokenIdx: number;
  let tokenLen: number;
  if (biIdx !== -1) { direction = "bidirectional"; tokenIdx = biIdx; tokenLen = 3; }
  else if (dirIdx !== -1) { direction = "directed"; tokenIdx = dirIdx; tokenLen = 2; }
  else if (undirIdx !== -1) { direction = "undirected"; tokenIdx = undirIdx; tokenLen = 2; }
  else return null;

  const from = trimmedRest.slice(0, tokenIdx).trim();
  let tail = trimmedRest.slice(tokenIdx + tokenLen).trim();
  if (!from) return null;

  let color: NodeMapColor | undefined;
  let style: NodeMapLineStyle = "solid";
  const modMatch = tail.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
  if (modMatch) {
    tail = modMatch[1].trim();
    for (const part of modMatch[2].split(",").map(p => p.trim()).filter(Boolean)) {
      const kv = part.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
      if (!kv) continue;
      if (kv[1].toLowerCase() === "color") color = kv[2].trim() as NodeMapColor;
      else if (kv[1].toLowerCase() === "style" && kv[2].trim() === "dashed") style = "dashed";
    }
  }

  const labelIdx = tail.indexOf(" : ");
  const to = (labelIdx !== -1 ? tail.slice(0, labelIdx) : tail).trim();
  const label = labelIdx !== -1 ? (tail.slice(labelIdx + 3).trim() || undefined) : undefined;
  if (!to) return null;

  return { from, to, direction, label, color, style };
}

/**
 * Writes an updated top-left position for a Node Map box back into its
 * source code block, replacing only the x/y values inside the bracket.
 */
export function writeNodeMapBoxPosition(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  boxName: string,
  x: number,
  y: number,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeNodeMapBoxPosition");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = findBoxLine(editor, lineStart, lineEnd, boxName);
  if (ln === -1) {
    console.warn(`Vizardry: writeNodeMapBoxPosition — box "${boxName}" not found in source`);
    return false;
  }
  const raw = editor.getLine(ln);
  const newLine = raw
    .replace(/x:\s*[+-]?[0-9.]+/, `x: ${Math.round(x)}`)
    .replace(/y:\s*[+-]?[0-9.]+/, `y: ${Math.round(y)}`);
  editor.replaceRange(newLine, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
  return true;
}

/**
 * Inserts a new `box:` declaration before the closing fence, resolving a
 * unique name if `baseName` collides with an existing box. Returns the
 * resolved name (so the caller can immediately open a rename overlay on it),
 * or null if the editor is unavailable.
 */
export function addNodeMapBox(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  x: number,
  y: number,
  baseName = "New Box",
): string | null {
  const resolved = resolveEditor(app, ctx, el, "addNodeMapBox");
  if (!resolved) return null;
  const { editor, lineStart, lineEnd } = resolved;
  const name = resolveUniqueBoxName(editor, lineStart, lineEnd, baseName);
  editor.replaceRange(`box: ${name} [x: ${Math.round(x)}, y: ${Math.round(y)}]\n`, { line: lineEnd, ch: 0 });
  return name;
}

/**
 * Removes a box's own declaration (and any indented body lines), plus every
 * `link:` line that references it as either endpoint. Deletions are applied
 * bottom-up (descending line number) so an earlier delete never shifts the
 * line index of a later one still queued for deletion.
 */
export function removeNodeMapBox(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  boxName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "removeNodeMapBox");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const boxLine = findBoxLine(editor, lineStart, lineEnd, boxName);
  if (boxLine === -1) {
    console.warn(`Vizardry: removeNodeMapBox — box "${boxName}" not found in source`);
    return false;
  }
  const body = findBodyRange(editor, boxLine, lineEnd);
  const linesToDelete = new Set<number>();
  for (let ln = boxLine; ln <= (body ? body.last : boxLine); ln++) linesToDelete.add(ln);

  const target = boxName.toLowerCase();
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim();
    if (!trimmed.toLowerCase().startsWith("link:")) continue;
    const parsed = parseLinkLine(trimmed.slice("link:".length));
    if (!parsed) continue;
    if (parsed.from.toLowerCase() === target || parsed.to.toLowerCase() === target) linesToDelete.add(ln);
  }

  for (const ln of [...linesToDelete].sort((a, b) => b - a)) {
    editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
  }
  return true;
}

/**
 * Renames a box throughout its source block — the `box:` line and every
 * `link:` from/to occurrence. All replacements are in-place (same line,
 * different text) so line numbers never shift.
 */
export function renameNodeMapBox(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldName: string,
  newName: string,
): boolean {
  if (!newName.trim() || newName === oldName) return false;

  const resolved = resolveEditor(app, ctx, el, "renameNodeMapBox");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const old = escRe(oldName);

  const reBox = new RegExp(`^(\\s*box:\\s*)${old}(?=\\s*\\[)`, "i");
  const reLinkFrom = new RegExp(`^(\\s*link:\\s*)${old}(?=\\s*(?:<->|->|--))`, "i");
  const reLinkTo = new RegExp(`((?:<->|->|--)\\s*)${old}(?=\\s*(?::|\\[|$))`, "i");

  let found = false;
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    let updated = raw;
    let changed = false;
    if (reBox.test(updated)) { updated = updated.replace(reBox, `$1${newName}`); changed = true; }
    if (reLinkFrom.test(updated)) { updated = updated.replace(reLinkFrom, `$1${newName}`); changed = true; }
    if (reLinkTo.test(updated)) { updated = updated.replace(reLinkTo, `$1${newName}`); changed = true; }
    if (changed) {
      editor.replaceRange(updated, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
      found = true;
    }
  }
  if (!found) console.warn(`Vizardry: renameNodeMapBox — "${oldName}" not found in source`);
  return found;
}

/**
 * Replaces a box's indented multi-line body text, inserting it if the box
 * currently has none and removing the block entirely if `newBody` is blank.
 */
export function writeNodeMapBoxBody(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  boxName: string,
  newBody: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeNodeMapBoxBody");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const boxLine = findBoxLine(editor, lineStart, lineEnd, boxName);
  if (boxLine === -1) {
    console.warn(`Vizardry: writeNodeMapBoxBody — box "${boxName}" not found in source`);
    return false;
  }
  const body = findBodyRange(editor, boxLine, lineEnd);
  const newLines = newBody.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const insertText = newLines.map(l => `  ${l}`).join("\n");

  if (body) {
    if (insertText) {
      editor.replaceRange(insertText, { line: body.first, ch: 0 }, { line: body.last, ch: editor.getLine(body.last).length });
    } else {
      editor.replaceRange("", { line: body.first, ch: 0 }, { line: body.last + 1, ch: 0 });
    }
  } else if (insertText) {
    const boxLineText = editor.getLine(boxLine);
    editor.replaceRange(`\n${insertText}`, { line: boxLine, ch: boxLineText.length });
  }
  return true;
}

/** Sets, replaces, or clears (pass null) a box's `color:` key in its bracket. */
export function setNodeMapBoxColor(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  boxName: string,
  color: NodeMapColor | null,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "setNodeMapBoxColor");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const ln = findBoxLine(editor, lineStart, lineEnd, boxName);
  if (ln === -1) {
    console.warn(`Vizardry: setNodeMapBoxColor — box "${boxName}" not found in source`);
    return false;
  }
  const raw = editor.getLine(ln);
  const hasColor = /,\s*color:\s*[^\]]+/i.test(raw);
  let newLine: string;
  if (hasColor) {
    newLine = color
      ? raw.replace(/,\s*color:\s*[^\]]+/i, `, color: ${color}`)
      : raw.replace(/,\s*color:\s*[^\]]+/i, "");
  } else if (color) {
    newLine = raw.replace(/\]\s*$/, `, color: ${color}]`);
  } else {
    return true; // nothing to clear
  }
  editor.replaceRange(newLine, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
  return true;
}

/**
 * Removes a `link:` line between two boxes (either endpoint matching
 * case-insensitively, since undirected/bidirectional links have no
 * canonical "from" side to prefer).
 */
export function removeNodeMapLink(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  fromName: string,
  toName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "removeNodeMapLink");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const from = fromName.toLowerCase(), to = toName.toLowerCase();

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith("link:")) continue;
    const parsed = parseLinkLine(trimmed.slice("link:".length));
    if (!parsed) continue;
    const a = parsed.from.toLowerCase(), b = parsed.to.toLowerCase();
    if ((a === from && b === to) || (a === to && b === from)) {
      editor.replaceRange("", { line: ln, ch: 0 }, { line: ln + 1, ch: 0 });
      return true;
    }
  }
  console.warn(`Vizardry: removeNodeMapLink — link "${fromName} -> ${toName}" not found`);
  return false;
}

/** Adds a new directed link between two existing boxes, unless one already exists. */
export function addNodeMapLink(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  fromName: string,
  toName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "addNodeMapLink");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const from = fromName.toLowerCase(), to = toName.toLowerCase();

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim();
    if (!trimmed.toLowerCase().startsWith("link:")) continue;
    const parsed = parseLinkLine(trimmed.slice("link:".length));
    if (!parsed) continue;
    const a = parsed.from.toLowerCase(), b = parsed.to.toLowerCase();
    if ((a === from && b === to) || (a === to && b === from)) return false; // already linked
  }

  editor.replaceRange(`link: ${fromName} -> ${toName}\n`, { line: lineEnd, ch: 0 });
  return true;
}

/** Combined writer for a link's color/style/direction/label — rebuilds the
 *  whole line since these parts interact (e.g. changing direction changes
 *  the separator the label/modifiers attach after). Pass `null` on a
 *  patch field to clear it, `undefined` to leave it unchanged. */
export function setNodeMapLinkStyle(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  fromName: string,
  toName: string,
  patch: {
    direction?: NodeMapLinkDirection;
    label?: string | null;
    color?: NodeMapColor | null;
    style?: NodeMapLineStyle;
  },
): boolean {
  const resolved = resolveEditor(app, ctx, el, "setNodeMapLinkStyle");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const from = fromName.toLowerCase(), to = toName.toLowerCase();

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith("link:")) continue;
    const parsed = parseLinkLine(trimmed.slice("link:".length));
    if (!parsed) continue;
    const a = parsed.from.toLowerCase(), b = parsed.to.toLowerCase();
    if (!((a === from && b === to) || (a === to && b === from))) continue;

    const direction = patch.direction ?? parsed.direction;
    const label = patch.label === undefined ? parsed.label : (patch.label ?? undefined);
    const color = patch.color === undefined ? parsed.color : (patch.color ?? undefined);
    const style = patch.style ?? parsed.style;

    const token = direction === "bidirectional" ? "<->" : direction === "undirected" ? "--" : "->";
    let newLine = `link: ${parsed.from} ${token} ${parsed.to}`;
    if (label) newLine += ` : ${label}`;
    const mods: string[] = [];
    if (color) mods.push(`color: ${color}`);
    if (style === "dashed") mods.push("style: dashed");
    if (mods.length > 0) newLine += ` [${mods.join(", ")}]`;

    const indent = raw.match(/^(\s*)/)?.[1] ?? "";
    editor.replaceRange(indent + newLine, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
    return true;
  }
  console.warn(`Vizardry: setNodeMapLinkStyle — link "${fromName} -> ${toName}" not found`);
  return false;
}
