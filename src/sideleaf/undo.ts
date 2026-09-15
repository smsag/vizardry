/**
 * The sideleaf's undo window.
 *
 * Removing a card from the panel is the one destructive-feeling action in
 * Vizardry with no other way back. Deleting a canvas item rewrites the note,
 * so the editor's own undo already covers it — Cmd+Z restores the line, and on
 * mobile the toolbar does the same. A card is pure panel state: nothing in the
 * vault changes, so there is nothing for the editor to undo, and a summary that
 * cost an LLM call would have to be fetched again.
 *
 * Hence a short window here and nowhere else. Adding the same bar to the
 * canvases would give a user two undo paths for one action, and pressing both
 * would re-insert a card that was already restored.
 */

/** How long a removed card can be brought back. */
export const UNDO_WINDOW_MS = 10_000;

export interface UndoEntry<T> {
  /** What was removed, in the order it should be restored. */
  items: T[];
  /** Puts them back. */
  restore: (items: T[]) => void;
}

/**
 * Holds one pending undo at a time.
 *
 * A second removal inside the window does not start a second timer — it joins
 * the pending batch, so "Clear all" followed by a single close offers one
 * "Undo" rather than a queue the user has to work through backwards.
 */
export class UndoWindow<T> {
  private entry: UndoEntry<T> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  /** Records a removal and (re)starts the window. */
  offer(items: T[], restore: (items: T[]) => void): void {
    if (items.length === 0) return;
    if (this.entry) this.entry = { items: [...this.entry.items, ...items], restore };
    else this.entry = { items: [...items], restore };
    this.arm();
    this.onChange();
  }

  /** How many removals are currently undoable; 0 when the window is closed. */
  pending(): number {
    return this.entry?.items.length ?? 0;
  }

  /** Restores everything in the window and closes it. */
  undo(): void {
    const entry = this.entry;
    this.discard();
    entry?.restore(entry.items);
  }

  /** Closes the window without restoring — the removal becomes permanent. */
  discard(): void {
    const had = this.entry !== null;
    this.entry = null;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (had) this.onChange();
  }

  private arm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.entry = null;
      this.onChange();
    }, UNDO_WINDOW_MS);
  }
}
