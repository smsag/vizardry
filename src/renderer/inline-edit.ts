/**
 * Shared inline text-editing plumbing used by the canvases — Story, Roadmap
 * and SCQA swap a rendered HTML label for a text input in place; Tree and
 * Wardley overlay a text input on their SVG nodes via foreignObject. Both
 * shapes share the same commit-on-Enter/blur, revert-on-Escape wiring.
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
 * Replace `host`'s rendered content with a text input for the duration of an
 * edit, committing on Enter/blur and reverting on Escape. No-ops if `host`
 * is already mid-edit.
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

  host.classList.add("vzd-editing");
  host.textContent = "";
  const input = host.createEl("input", { cls: "vzd-rename-input vzd-inline-input", type: "text" });
  input.value = currentValue;

  const blurGuardMs = options.blurGuardMs ?? DEFAULT_BLUR_GUARD_MS;
  let blurGuarded = blurGuardMs > 0;
  const blurGuardTimer = blurGuarded
    ? setTimeout(() => { blurGuarded = false; }, blurGuardMs)
    : undefined;
  input.focus({ preventScroll: true });
  input.select();

  wireRenameInputKeys(input, (commit) => {
    if (blurGuardTimer !== undefined) clearTimeout(blurGuardTimer);
    host.classList.remove("vzd-editing");
    const v = input.value.trim();
    if (commit && shouldCommit(v, currentValue)) {
      onCommit(v);
      renderDisplay(host, v); // Optimistic; a re-render replaces this once the write lands.
    } else {
      renderDisplay(host, currentValue);
    }
  }, { ignoreBlur: () => blurGuarded });
}

export interface TextareaEditOptions {
  /** Class toggled on `editHost` for the duration of the edit. Default "vzd-editing". */
  editingClass?: string;
  /** Extra class(es) added to the textarea alongside "vzd-plain-textarea". */
  textareaClass?: string;
  /** Textarea min-height (px), e.g. the cell's pre-edit rendered height. */
  minHeight?: number;
  /** Trim the value both when loading it into the textarea and on commit.
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

/**
 * Replace `contentHost`'s content with an auto-resizing textarea for the
 * duration of an edit, committing on blur/Tab and reverting on Escape.
 * `editHost` carries the "currently editing" class — same element as
 * `contentHost` unless a canvas keeps its editing indicator on a wrapper.
 * No-ops if `editHost` is already mid-edit.
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

  editHost.addClass(editingClass);
  contentHost.empty();
  contentHost.removeAttribute("data-placeholder");

  const textarea = contentHost.createEl("textarea", {
    cls: `vzd-plain-textarea${options.textareaClass ? ` ${options.textareaClass}` : ""}`,
  });
  if (options.minHeight !== undefined) textarea.style.minHeight = `${options.minHeight}px`;
  textarea.value = trimValue ? currentValue.trim() : currentValue;

  const resize = (): void => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  resize();
  textarea.addEventListener("input", resize);
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;
  const finish = (commit: boolean): void => {
    if (committed) return;
    committed = true;
    editHost.removeClass(editingClass);
    const raw = textarea.value;
    const value = commit ? (trimValue ? raw.trim() : raw) : currentValue;
    if (commit) {
      const write = (): void => onCommit(value);
      if (options.wrapCommit) options.wrapCommit(write); else write();
    }
    options.renderDisplay(contentHost, value);
  };

  textarea.addEventListener("blur", () => finish(true));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
    if (e.key === "Tab") {
      e.preventDefault();
      if (options.onTab === "indent") {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + "  " + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        resize();
      } else {
        finish(true);
      }
    }
  });
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
  const guard = createBlurGuard();
  let done = false;

  el.classList.add("vzd-inplace-editing");
  el.setAttribute("contenteditable", "plaintext-only");
  // Engines without plaintext-only report it back as unset; fall back to
  // plain contenteditable, whose pasted markup is flattened by reading text.
  if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
  el.setAttribute("spellcheck", "false");
  el.focus({ preventScroll: true });

  // Caret at the end, as on the title.
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
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
  };
  const onBlur = (): void => {
    if (guard.ignoreBlur()) return;
    finish(true);
  };
  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("blur", onBlur);
}
