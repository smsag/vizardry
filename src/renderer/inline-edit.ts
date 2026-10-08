/**
 * Shared inline text-editing plumbing used by the canvases — HTML labels
 * (Story, Roadmap, SCQA, Pro / Contra, header chips, …) turn editable where
 * they stand; Tree and Wardley overlay a text input on their SVG nodes via
 * foreignObject. Both shapes share the same commit-on-Enter/blur,
 * revert-on-Escape wiring.
 */

interface WireKeysOptions {
  /** Call stopPropagation() on every keydown so keystrokes don't leak to
   *  ancestor handlers — needed inside SVG canvases that bind their own
   *  keyboard shortcuts on the surrounding document/svg. */
  stopPropagation?: boolean;
  /** If this returns true when a blur fires, the blur is ignored entirely
   *  (neither commits nor reverts). Works around CM6/Live Preview immediately
   *  stealing focus back right after `.focus()`, which would otherwise fire
   *  a spurious blur before the user has touched the input at all. */
  ignoreBlur?: () => boolean;
}

/** Default grace window (ms) for ignoring a blur right after an input is
 *  focused — see WireKeysOptions.ignoreBlur. Obsidian's CM6 Live Preview can
 *  steal focus back immediately after `.focus()` (e.g. right after a widget
 *  remounts), which would otherwise fire a spurious blur and close the
 *  editor before the user has typed anything. */
export const DEFAULT_BLUR_GUARD_MS = 150;

/**
 * Returns an `ignoreBlur` callback usable with wireRenameInputKeys, active
 * for `ms` from creation. Call `dispose()` once the input's own finish
 * handler has run, to clear the timer early.
 */
export function createBlurGuard(ms: number = DEFAULT_BLUR_GUARD_MS): { ignoreBlur: () => boolean; dispose: () => void } {
  let guarded = ms > 0;
  const timer = guarded ? setTimeout(() => { guarded = false; }, ms) : undefined;
  return {
    ignoreBlur: () => guarded,
    dispose: () => { if (timer !== undefined) clearTimeout(timer); },
  };
}

/**
 * Wires Enter (commit), Escape (revert) and blur (commit) on `input`,
 * calling `onFinish` exactly once with whichever happened first.
 */
export function wireRenameInputKeys(
  input: HTMLInputElement,
  onFinish: (commit: boolean) => void,
  options: WireKeysOptions = {},
): void {
  let committed = false;
  const finish = (commit: boolean): void => {
    if (committed) return;
    committed = true;
    onFinish(commit);
  };
  input.addEventListener("blur", () => {
    if (options.ignoreBlur?.()) return;
    finish(true);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
    if (options.stopPropagation) e.stopPropagation();
  });
}

export interface InlineEditOptions {
  /** Re-render the host's display content for a value. Defaults to setting plain textContent. */
  renderDisplay?: (host: HTMLElement, value: string) => void;
  /** Whether a submitted value should be committed vs. reverted to currentValue.
   *  Defaults to: non-empty and different from currentValue. */
  shouldCommit?: (value: string, currentValue: string) => boolean;
  /** Grace window (ms) during which a blur is ignored — see wireRenameInputKeys's
   *  ignoreBlur. Defaults to DEFAULT_BLUR_GUARD_MS; pass 0 to disable. */
  blurGuardMs?: number;
}

/**
 * Edit `host`'s text where it stands (see {@link editTextInPlace}): the label
 * shows its raw value and turns editable, keeping its font, size and box, so
 * nothing around it moves. Swapping in an `<input>` instead let Obsidian's
 * input styles (height, padding, background) resize the row — the field
 * jumped. Commits on Enter/blur, reverts on Escape; no-ops if `host` is
 * already mid-edit.
 */
export function activateInlineEdit(
  host: HTMLElement,
  currentValue: string,
  onCommit: (newValue: string) => void,
  options: InlineEditOptions = {},
): void {
  if (host.classList.contains("vzd-editing")) return;
  const renderDisplay = options.renderDisplay ?? ((h, v) => { h.textContent = v; });
  const shouldCommit = options.shouldCommit ?? ((v, cur) => !!v && v !== cur);

  // A placeholder's styling (`…--empty`: faint, italic) must not dress the
  // text being typed; the original classes come back before the display is
  // repainted.
  const className = stripEmptyClasses(host);
  host.classList.add("vzd-editing");
  host.textContent = currentValue;

  editTextInPlace(host, {
    initial: currentValue,
    blurGuardMs: options.blurGuardMs,
    selectAll: true,
    onDone: (commit, raw) => {
      host.className = className;
      const v = raw.replace(/\s*\n\s*/g, " ").trim();
      if (commit && shouldCommit(v, currentValue)) {
        onCommit(v);
        renderDisplay(host, v); // Optimistic; a re-render replaces this once the write lands.
      } else {
        renderDisplay(host, currentValue);
      }
    },
  });
}

export interface TextareaEditOptions {
  /** Class toggled on `editHost` for the duration of the edit. Default "vzd-editing". */
  editingClass?: string;
  /** Min-height (px) held on `contentHost` while editing, e.g. the cell's
   *  pre-edit rendered height. */
  minHeight?: number;
  /** Trim the value both when loading it for editing and on commit.
   *  Default true. Pass false for canvases (e.g. Pace Layers) that write the
   *  raw multi-line value verbatim and only trim for display. */
  trimValue?: boolean;
  /** Tab behaviour: "commit" closes the editor (default); "indent" inserts
   *  two spaces at the cursor instead, for free-text multi-line cells. */
  onTab?: "commit" | "indent";
  /** Wraps the actual write callback, e.g. to preserve editor scroll position
   *  across the DOM mutation a write triggers. */
  wrapCommit?: (write: () => void) => void;
  /** Re-render `contentHost`'s non-edit display for a value (commit or revert). */
  renderDisplay: (contentHost: HTMLElement, value: string) => void;
}

/** Strip placeholder styling (`…--empty`, the empty block) from `el` for an
 *  edit; returns the original class list to restore afterwards. */
function stripEmptyClasses(el: HTMLElement): string {
  const className = el.className;
  Array.from(el.classList).forEach((c) => {
    if (c.endsWith("--empty") || c === "vizardry-block-empty") el.classList.remove(c);
  });
  return className;
}

/**
 * Multi-line counterpart of {@link activateInlineEdit}: `contentHost` shows
 * its raw value and turns editable in place (Enter adds a line, Mod+Enter or
 * blur or Tab saves, Escape reverts) — no textarea swapped in, so the cell
 * keeps its font and size. `editHost` carries the "currently editing" class —
 * same element as `contentHost` unless a canvas keeps its editing indicator
 * on a wrapper. No-ops if `editHost` is already mid-edit.
 */
export function activateTextareaEdit(
  editHost: HTMLElement,
  contentHost: HTMLElement,
  currentValue: string,
  onCommit: (newValue: string) => void,
  options: TextareaEditOptions,
): void {
  const editingClass = options.editingClass ?? "vzd-editing";
  if (editHost.hasClass(editingClass)) return;
  const trimValue = options.trimValue ?? true;
  const initial = trimValue ? currentValue.trim() : currentValue;

  const className = stripEmptyClasses(contentHost);
  const minHeight = contentHost.style.minHeight;
  editHost.addClass(editingClass);
  contentHost.removeAttribute("data-placeholder");
  contentHost.addClass("vzd-inplace-editing--multiline");
  if (options.minHeight !== undefined) contentHost.style.minHeight = `${options.minHeight}px`;
  contentHost.textContent = initial;

  editTextInPlace(contentHost, {
    initial,
    multiline: true,
    onTab: options.onTab ?? "commit",
    onDone: (commit, raw) => {
      contentHost.className = className;
      contentHost.style.minHeight = minHeight;
      editHost.removeClass(editingClass);
      const value = commit ? (trimValue ? raw.trim() : raw) : currentValue;
      if (commit) {
        const write = (): void => onCommit(value);
        if (options.wrapCommit) options.wrapCommit(write); else write();
      }
      options.renderDisplay(contentHost, value);
    },
  });
}

/** Type `text` at the caret in `el`. insertText keeps it on the browser's
 *  undo stack; without it (no execCommand), splice it into the selection. */
function insertAtCaret(el: HTMLElement, text: string): void {
  const doc = el.ownerDocument;
  if (typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text)) return;
  const sel = doc.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) { el.append(text); return; }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * The text of a contenteditable element with its line breaks, read from the
 * nodes rather than `innerText` (which depends on layout): a `<br>` or the
 * start of a block the browser inserted on Enter counts as a new line.
 */
function editableText(el: HTMLElement): string {
  let out = "";
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) { out += child.nodeValue ?? ""; continue; }
      if (!(child instanceof HTMLElement)) continue;
      if (child.tagName === "BR") { out += "\n"; continue; }
      const block = child.tagName === "DIV" || child.tagName === "P";
      if (block && out.length > 0 && !out.endsWith("\n")) out += "\n";
      walk(child);
    }
  };
  walk(el);
  return out;
}

interface InPlaceEditOptions {
  /** The text to restore on cancel. */
  initial: string;
  /** Enter adds a line (Mod+Enter saves) instead of saving. */
  multiline?: boolean;
  /** Select the whole text instead of placing the caret at the end. */
  selectAll?: boolean;
  /** Blur grace window (ms), see createBlurGuard. Default DEFAULT_BLUR_GUARD_MS. */
  blurGuardMs?: number;
  /** Tab saves ("commit") or inserts two spaces ("indent"). Unset: the
   *  browser moves focus, and the blur saves. */
  onTab?: "commit" | "indent";
  /** Called once: `commit` is false on Escape. `value` is the edited text. */
  onDone: (commit: boolean, value: string) => void;
}

/**
 * Edits `el`'s own text where it stands, the way a canvas title does: the
 * element turns contenteditable (plain text only), keeps its font, size and
 * position, and shows the title's accent underline — no separate input or
 * textarea swapped in. Enter saves (Mod+Enter when `multiline`), Escape
 * reverts, and a real blur saves; the CM6 focus-steal blur right after
 * focusing is ignored, as for the title.
 */
export function editTextInPlace(el: HTMLElement, opts: InPlaceEditOptions): void {
  const guard = createBlurGuard(opts.blurGuardMs);
  let done = false;

  el.classList.add("vzd-inplace-editing");
  el.setAttribute("contenteditable", "plaintext-only");
  // Engines without plaintext-only report it back as unset; fall back to
  // plain contenteditable, whose pasted markup is flattened by reading text.
  if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
  el.setAttribute("spellcheck", "false");
  el.focus({ preventScroll: true });

  // Caret at the end, as on the title (or the whole text selected).
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  if (!opts.selectAll) range.collapse(false);
  const sel = el.ownerDocument.defaultView?.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  const readText = (): string => editableText(el).replace(/\u00a0/g, " ");

  const finish = (commit: boolean): void => {
    if (done) return;
    done = true;
    guard.dispose();
    el.removeEventListener("keydown", onKeyDown);
    el.removeEventListener("blur", onBlur);
    el.classList.remove("vzd-inplace-editing");
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    const value = readText();
    if (!commit) el.textContent = opts.initial;
    opts.onDone(commit, value);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    // Keep keystrokes away from the canvas's and Obsidian's own shortcuts.
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); finish(false); return; }
    if (e.key === "Enter" && (!opts.multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true); }
    if (e.key === "Tab" && opts.onTab) {
      e.preventDefault();
      if (opts.onTab === "commit") finish(true);
      else insertAtCaret(el, "  ");
    }
  };
  const onBlur = (): void => {
    if (guard.ignoreBlur()) return;
    finish(true);
  };
  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("blur", onBlur);
}
