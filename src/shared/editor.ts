import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

export type ResolvedEditor = {
  editor: MarkdownView["editor"];
  lineStart: number;
  lineEnd: number;
};

/**
 * Render-scoped read-only override. While `renderReadOnly` is on the stack,
 * `isEditModeActive` reports false regardless of the actual view mode, so every
 * renderer (all 18 gate their edit affordances on `isEditModeActive`) skips
 * wiring editing for that render. Used by the multi-canvas carousel: several
 * canvases share one code fence, so per-canvas write-back can't target the
 * right source lines — the whole carousel renders read-only in this first
 * release. Rendering is fully synchronous, so a simple depth counter is safe
 * (renderers decide their edit state at render time, not on later interaction).
 */
let readOnlyDepth = 0;
export function renderReadOnly<T>(fn: () => T): T {
  readOnlyDepth++;
  try {
    return fn();
  } finally {
    readOnlyDepth--;
  }
}

/**
 * True unless the note is open in Obsidian's read-only Reading View.
 * A canvas is only ever editable in Live Preview or raw Source Mode —
 * Obsidian's plugin API reports both of those as "source" and only
 * Reading View as "preview".
 */
export function isEditModeActive(app: App): boolean {
  if (readOnlyDepth > 0) return false;
  return app.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";
}

/**
 * Resolves the live CodeMirror editor for the note containing `el`.
 * Returns null when the editor is unavailable — most commonly Reading View.
 *
 * ctx.getSectionInfo() returns null in Obsidian's Live Preview / source mode,
 * so we fall back to scanning the editor content for the code fence whose
 * body matches the source stored on the container's dataset.vzSource.
 *
 * Obsidian can also return section info that is NON-null but STALE — e.g. the
 * moment a Live Preview code-block widget first mounts after the cursor
 * leaves it, the reported line range can point at the wrong location. We
 * therefore cross-check any non-null info against the stored vzSource before
 * trusting it, falling back to the full-document scan when it doesn't match.
 * Without this, a stale-but-non-null result would silently point the write at
 * the wrong lines and fail — bypassing the vzSource fallback entirely, since
 * that only ran when info was null.
 */
export function resolveEditor(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  caller: string,
): ResolvedEditor | null {
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: ${caller} — file not found: ${ctx.sourcePath}`);
    return null;
  }
  // When the same file is open in multiple panes, each has its own
  // independent (and possibly not-yet-synced) CM6 editor state. Prefer the
  // pane whose DOM actually contains `el` — the canvas the user is looking
  // at and clicked to edit — over an arbitrary one, so the write lands where
  // the user expects it instead of in a different, unfocused split.
  const candidates = app.workspace.getLeavesOfType("markdown").filter(
    (l): l is typeof l & { view: MarkdownView } => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath,
  );
  const leaf = candidates.find(l => l.view.containerEl?.contains(el)) ?? candidates[0];
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn(`Vizardry: ${caller} — no live editor`);
    return null;
  }

  const source = el.dataset.vzSource;

  // Primary path: section info from the post-processor context (works in Read Mode).
  const info = ctx.getSectionInfo(el);
  if (info && (!source || sectionContainsSource(editor, info.lineStart, info.lineEnd, source))) {
    return { editor, lineStart: info.lineStart, lineEnd: info.lineEnd };
  }
  if (info) {
    console.warn(`Vizardry: ${caller} — section info looked stale (didn't contain the expected block content); falling back to a full-document scan`);
  }

  // Fallback: scan editor lines for the code fence containing this block.
  // Needed in Live Preview / source mode where getSectionInfo returns null,
  // and as a recovery path when it returned stale bounds (above).
  if (source) {
    const range = findCodeFenceBySource(editor, source);
    if (range) return { editor, ...range };
    console.warn(`Vizardry: ${caller} — source scan found no matching code fence`);
    return null;
  }

  console.warn(`Vizardry: ${caller} — no section info and no vzSource fallback`);
  return null;
}

/** True when the given line range's text contains `source` (trimmed). Used to
 *  detect stale, non-null section info before trusting it. */
function sectionContainsSource(
  editor: MarkdownView["editor"],
  lineStart: number,
  lineEnd: number,
  source: string,
): boolean {
  const normalised = source.trim();
  if (!normalised) return true;
  const lineCount = editor.lineCount();
  let text = "";
  for (let ln = Math.max(0, lineStart); ln <= lineEnd && ln < lineCount; ln++) {
    text += (text ? "\n" : "") + editor.getLine(ln);
  }
  return text.includes(normalised);
}

/**
 * Scans the editor for a code fence whose trimmed body matches source.
 * Returns the lineStart (opening ```) and lineEnd (closing ```) line indices.
 *
 * Respects CommonMark fence-length matching: a closing fence must have at
 * least as many backticks as the opening one. Without this, a canvas body
 * that legitimately contains a nested example fenced with fewer backticks
 * (only possible when the outer ```vizardry block itself opens with 4+
 * backticks) would have its scan stop at that inner fence line, truncating
 * the captured body and causing a false "no matching fence" result.
 */
function findCodeFenceBySource(
  editor: MarkdownView["editor"],
  source: string,
): { lineStart: number; lineEnd: number } | null {
  const lineCount = editor.lineCount();
  const normalised = source.trim();

  const matches: { lineStart: number; lineEnd: number }[] = [];
  for (let i = 0; i < lineCount; i++) {
    const line = editor.getLine(i).trim();
    const openMatch = line.match(/^(`{3,})/);
    if (!openMatch) continue;
    const closeRe = new RegExp(`^\`{${openMatch[1].length},}\\s*$`);

    const fenceStart = i;
    let body = "";
    let j = i + 1;
    for (; j < lineCount; j++) {
      const inner = editor.getLine(j);
      if (closeRe.test(inner.trim())) break;
      body += (body ? "\n" : "") + inner;
    }
    if (body.trim() === normalised) matches.push({ lineStart: fenceStart, lineEnd: j });
    i = j;
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    // Two canvases with byte-identical source can't be told apart by a content
    // scan — we edit the first, but surface the ambiguity so it's diagnosable.
    console.warn(`Vizardry: ${matches.length} code fences share identical source; editing the first — give the canvases distinct content to disambiguate`);
  }
  return matches[0];
}

/**
 * True when `line` sits inside the body of an open ```vizardry fence (not on
 * the opening or closing fence delimiter itself). Used to scope the heading
 * autocomplete suggester (see heading-suggest.ts) so it only ever activates
 * inside a vizardry code block.
 *
 * Same fence-length-aware scanning as findCodeFenceBySource above: a closing
 * fence must have at least as many backticks as the opening one, so a nested
 * example fence with fewer backticks (e.g. inside a block's body content)
 * doesn't falsely close the outer vizardry fence.
 */
export function isInsideVizardryFence(editor: MarkdownView["editor"], line: number): boolean {
  const unmatchedClosers: number[] = [];

  for (let i = line; i >= 0; i--) {
    const trimmed = editor.getLine(i).trim();
    const fenceMatch = trimmed.match(/^(`{3,})(.*)$/);
    if (!fenceMatch) continue;

    const backtickLen = fenceMatch[1].length;
    const rest = fenceMatch[2].trim();

    if (rest === "") {
      unmatchedClosers.push(backtickLen);
    } else {
      const matchIdx = unmatchedClosers.findIndex(cl => cl >= backtickLen);
      if (matchIdx !== -1) {
        unmatchedClosers.splice(matchIdx, 1);
      } else {
        if (i === line) return false;
        const lang = rest.split(/\s+/)[0]?.toLowerCase() ?? "";
        return lang === "vizardry";
      }
    }
  }

  return false;
}

export function insertTemplateAtCursor(editor: Editor, template: string): void {
  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);
  const onBlankLine = lineText.trim() === "";
  const from = onBlankLine
    ? { line: cursor.line, ch: 0 }
    : { line: cursor.line, ch: lineText.length };
  editor.replaceRange(onBlankLine ? template : "\n" + template, from);
  const firstKeyLine = cursor.line + (onBlankLine ? 1 : 2);
  const firstKeyText = editor.getLine(firstKeyLine);
  editor.setCursor({ line: firstKeyLine, ch: firstKeyText.length });
}
