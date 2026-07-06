/**
 * Shared pointer-drag gesture for the draggable card canvases (card blocks,
 * Story, Roadmap, SCQA grid).
 *
 * A drag begins only after the pointer moves past a distance threshold — a
 * plain click or tap never starts a drag. On touch this also means the card is
 * NOT picked up on `touchstart`; the initial touch can still scroll until the
 * threshold is crossed, at which point the drag takes over and suppresses
 * scrolling. `hold-still` is intentionally left free for a future long-press
 * preview gesture.
 *
 * The helper owns gesture detection and all document-level move/end listeners;
 * the caller supplies the per-canvas drag body via the callbacks. Listeners are
 * bound on the card's own document so pop-out Obsidian windows work correctly.
 */

export const DRAG_THRESHOLD_PX = 8;

/**
 * Runs a source write-back while preserving the note's scroll position.
 * editor.replaceRange() moves the CM6 cursor to the edited line, which makes
 * Obsidian scroll there; we snapshot the offset, run the write, and restore it
 * on the next frame. Window-aware (uses the given window's scroll API) so it
 * behaves correctly in pop-out windows. Shared by every card drag's endDrag.
 */
export function preserveScroll(win: Window, write: () => void): void {
  const x = win.scrollX;
  const y = win.scrollY;
  write();
  win.requestAnimationFrame(() => win.scrollTo(x, y));
}

export interface DragGestureHandlers {
  /** Movement (px) required before a drag starts. Defaults to DRAG_THRESHOLD_PX. */
  threshold?: number;
  /** Return false to ignore the gesture (e.g. clicks on buttons or active inputs). */
  shouldStart?: (target: HTMLElement) => boolean;
  /** Whether to preventDefault on mousedown. Default true; Roadmap passes false
   *  so native double-click detection (used for rename) still works. */
  preventDefaultDown?: boolean;
  /** Begin the drag — create the ghost/placeholder and set drag state. */
  onStart: (clientX: number, clientY: number) => void;
  /** Update the drag as the pointer moves. */
  onMove: (clientX: number, clientY: number) => void;
  /** Finish the drag — commit the reorder/move. */
  onEnd: () => void;
  /** Optional: a press that never became a drag (plain click / tap). */
  onClick?: () => void;
}

export function enableDragGesture(card: HTMLElement, h: DragGestureHandlers): void {
  const threshold = h.threshold ?? DRAG_THRESHOLD_PX;
  const doc = card.ownerDocument;

  const past = (dx: number, dy: number): boolean =>
    Math.abs(dx) > threshold || Math.abs(dy) > threshold;

  // ── Mouse ──────────────────────────────────────────────────────────────────
  card.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (h.shouldStart && !h.shouldStart(e.target as HTMLElement)) return;
    if (h.preventDefaultDown !== false) e.preventDefault();
    e.stopPropagation();

    const ox = e.clientX, oy = e.clientY;
    let dragging = false;

    const move = (mv: MouseEvent): void => {
      if (!dragging) {
        if (!past(mv.clientX - ox, mv.clientY - oy)) return;
        dragging = true;
        mv.preventDefault(); // suppress text selection once the drag begins
        h.onStart(mv.clientX, mv.clientY);
        return;
      }
      h.onMove(mv.clientX, mv.clientY);
    };
    const up = (): void => {
      doc.removeEventListener("mousemove", move);
      doc.removeEventListener("mouseup", up);
      if (dragging) h.onEnd();
      else h.onClick?.();
    };

    doc.addEventListener("mousemove", move);
    doc.addEventListener("mouseup", up);
  });

  // ── Touch ──────────────────────────────────────────────────────────────────
  // touchstart is passive: we never pick the card up here, so the initial touch
  // can scroll. Only once the drag starts (in the non-passive touchmove) do we
  // preventDefault to stop the page scrolling under the card.
  card.addEventListener("touchstart", (e) => {
    if (h.shouldStart && !h.shouldStart(e.target as HTMLElement)) return;
    const t0 = e.touches[0];
    const ox = t0.clientX, oy = t0.clientY;
    let dragging = false;

    const move = (ev: TouchEvent): void => {
      const p = ev.touches[0];
      if (!dragging) {
        if (!past(p.clientX - ox, p.clientY - oy)) return;
        dragging = true;
        h.onStart(p.clientX, p.clientY);
      }
      ev.preventDefault();
      h.onMove(p.clientX, p.clientY);
    };
    const end = (): void => {
      doc.removeEventListener("touchmove", move);
      doc.removeEventListener("touchend", end);
      if (dragging) h.onEnd();
      else h.onClick?.();
    };

    doc.addEventListener("touchmove", move, { passive: false });
    doc.addEventListener("touchend", end);
  }, { passive: true });
}
