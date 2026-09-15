/**
 * Swipe a sideleaf card aside to remove it.
 *
 * This is an accelerator, not the only route — the card's ⋯ menu does the same
 * thing and is what keyboard users have. It exists here and on no canvas for
 * one reason: the sideleaf is a plain vertical list whose cards are not
 * draggable, so the horizontal axis is free. On the card canvases a horizontal
 * drag already means "move this card to another column", and on the SVG
 * canvases there is no card to swipe.
 *
 * Built on the same pointer stream as `drag-gesture.ts` and with the same
 * bargain: nothing happens until the pointer has travelled far enough to mean
 * it, so a tap, a click, or a vertical scroll through the panel never starts a
 * swipe. Vertical movement wins ties, because scrolling the panel is the more
 * common intent.
 */

/** Horizontal travel (px) before the card starts following the pointer. */
const START_PX = 12;
/** Fraction of the card's width that commits the removal on release. */
const COMMIT_RATIO = 0.4;
/** Hard floor for the commit distance on a very narrow panel. */
const COMMIT_MIN_PX = 64;

export interface SwipeOptions {
  /** Runs when the swipe is carried far enough and released. */
  onRemove: () => void;
}

export function enableSwipeToRemove(card: HTMLElement, opts: SwipeOptions): void {
  let startX = 0;
  let startY = 0;
  let active = false;
  let armed = false;
  let pointerId: number | null = null;

  const reset = (animate: boolean): void => {
    card.removeClass("vzd-card--swiping");
    if (!animate) card.style.transition = "none";
    card.style.transform = "";
    card.style.removeProperty("--vzd-swipe-progress");
    if (!animate) {
      // Force the cleared transform to land before transitions come back.
      void card.offsetWidth;
      card.style.transition = "";
    }
    active = false;
    armed = false;
    pointerId = null;
  };

  card.addEventListener("pointerdown", (e) => {
    // Never start from the controls inside the card — the ⋯ trigger and the
    // key link own their own gestures.
    if ((e.target as HTMLElement).closest("button, a")) return;
    armed = true;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
  });

  card.addEventListener("pointermove", (e) => {
    if (!armed || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!active) {
      // A mostly-vertical drag is the user scrolling the panel; let it go.
      if (Math.abs(dy) > Math.abs(dx)) { armed = false; return; }
      if (Math.abs(dx) < START_PX) return;
      active = true;
      card.addClass("vzd-card--swiping");
      // Take the pointer so the gesture survives leaving the card's box.
      card.setPointerCapture?.(e.pointerId);
    }

    card.style.transform = `translateX(${dx}px)`;
    // Drives the backing colour's strength — the further it goes, the more
    // committed it looks.
    card.style.setProperty("--vzd-swipe-progress", String(Math.min(1, Math.abs(dx) / commitDistance(card))));
  });

  const end = (e: PointerEvent): void => {
    if (!armed || e.pointerId !== pointerId) return;
    if (!active) {
      // A plain tap: nothing was moved, so there is nothing to snap back and
      // no reason to force a synchronous layout on every click on a card.
      armed = false;
      pointerId = null;
      return;
    }
    const dx = e.clientX - startX;
    if (Math.abs(dx) >= commitDistance(card)) {
      // Carry the card the rest of the way out before it goes, so the removal
      // reads as a consequence of the gesture rather than a disappearance.
      card.addClass("vzd-card--swiped-out");
      card.style.transform = `translateX(${dx > 0 ? "110%" : "-110%"})`;
      window.setTimeout(() => opts.onRemove(), 140);
      active = false;
      armed = false;
      return;
    }
    reset(true);
  };

  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", (e) => { if (e.pointerId === pointerId) reset(true); });
}

function commitDistance(card: HTMLElement): number {
  return Math.max(COMMIT_MIN_PX, card.offsetWidth * COMMIT_RATIO);
}
