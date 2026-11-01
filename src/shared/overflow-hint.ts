import { onDisconnected } from "./lifecycle";

/** Class set while `el` has more content to the right than it shows. */
export const OVERFLOW_RIGHT_CLS = "vzd-overflow--right";

/**
 * Fades the right edge of a sideways-scrolling area while there is more to
 * see, so a diagram or table that runs past the canvas doesn't look like it
 * simply ends at the cut (SIPOC flow's Customer column, a wide RACI). The
 * class follows scrolling and any resize of the area or its content; the
 * fade itself, and turning it off in export and presentation, is CSS.
 */
export function watchOverflowHint(el: HTMLElement): void {
  const update = (): void => {
    el.classList.toggle(OVERFLOW_RIGHT_CLS, el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  };
  el.addEventListener("scroll", update, { passive: true });
  const RO = (el.ownerDocument.defaultView ?? window).ResizeObserver;
  if (!RO) return;
  const ro = new RO(update);
  ro.observe(el);
  if (el.firstElementChild) ro.observe(el.firstElementChild);
  onDisconnected(el, () => ro.disconnect());
}
