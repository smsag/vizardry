/**
 * Debounced, serialised task runner for the export dialog's live preview.
 *
 * `schedule()` coalesces a burst of rapid calls into a single run (debounce),
 * and chains runs so two never overlap — the preview shares the document head
 * and one container, so overlapping Paged.js paginations would corrupt each
 * other's stylesheet bookkeeping. This is pure timing logic (the task itself
 * does the DOM work), which keeps it unit-testable.
 */
export class SerialScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly delayMs: number,
  ) {}

  /** Queue a run after the debounce delay, or immediately when `now` is true. */
  schedule(now = false): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    const enqueue = (): void => {
      this.timer = null;
      if (this.disposed) return;
      this.chain = this.chain
        .catch(() => {})
        .then(() => (this.disposed ? undefined : this.task()));
    };
    if (now) enqueue();
    else this.timer = setTimeout(enqueue, this.delayMs);
  }

  /** The tail of the run chain — await to know queued work has drained. */
  idle(): Promise<void> {
    return this.chain.catch(() => {});
  }

  /** Stop scheduling; an in-flight task still finishes but no new one starts. */
  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
