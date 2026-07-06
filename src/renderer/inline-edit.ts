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
  /** Grace window (ms) during which a blur is ignored — see wireRenameInputKeys's ignoreBlur. */
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

  let blurGuarded = (options.blurGuardMs ?? 0) > 0;
  const blurGuardTimer = blurGuarded
    ? setTimeout(() => { blurGuarded = false; }, options.blurGuardMs)
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
