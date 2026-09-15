/**
 * "Has this subtree finished rendering?" — the wait every capture needs before
 * it measures, and the one exposed to other plugins as `api.whenSettled`.
 *
 * Vizardry canvases lay out one frame after insertion, images load whenever
 * they load, and an asynchronous diagram renderer swaps its SVG in after the
 * markdown pass. Waiting a fixed delay would be either too short for a slow
 * note or wasted on a fast one, so this adapts: frames, then images, then DOM
 * quiescence with a hard ceiling so a subtree that never stops animating cannot
 * hang the caller.
 */

import { ownerWindow } from "./lifecycle";

/** Defaults: how long the DOM must be quiet, and the hard ceiling. */
export const SETTLE_QUIET_MS = 120;
export const SETTLE_MAX_MS = 2500;

/**
 * Resolve on the next animation frame, but never hang: `requestAnimationFrame`
 * is throttled (or paused entirely) while the window is backgrounded, so we
 * race it against a timeout to guarantee the caller keeps moving.
 */
export function nextFrame(win: Window = window): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    win.requestAnimationFrame(finish);
    win.setTimeout(finish, 100);
  });
}

/** Resolve once an image has loaded (or immediately if already complete/broken). */
function whenImageSettled(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

/**
 * Resolve once `el`'s subtree has stopped mutating for `quietMs`, or `maxMs`
 * elapses — whichever comes first. This adapts to however long asynchronous
 * rendering actually takes (chiefly Mermaid, which swaps in its SVG after the
 * markdown pass) instead of guessing a fixed delay: quick notes settle almost
 * immediately, slow ones get up to the cap.
 */
function waitForQuiescence(el: HTMLElement, quietMs: number, maxMs: number): Promise<void> {
  const win = ownerWindow(el);
  return new Promise((resolve) => {
    let quietTimer = 0;
    let capTimer = 0;
    const finish = (): void => {
      win.clearTimeout(quietTimer);
      win.clearTimeout(capTimer);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      win.clearTimeout(quietTimer);
      quietTimer = win.setTimeout(finish, quietMs);
    });
    // Hard ceiling so a canvas that never stops animating can't hang the caller.
    capTimer = win.setTimeout(finish, maxMs);
    // If nothing ever mutates, this fires and we resolve after one quiet window.
    quietTimer = win.setTimeout(finish, quietMs);
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
  });
}

/**
 * Wait for async rendering inside `el` to settle: two animation frames (so
 * synchronously inserted Vizardry canvases lay out — they mark themselves
 * `data-vizardry-rendered` on completion), then any images, then DOM
 * quiescence to catch Mermaid's asynchronous SVG swap.
 *
 * Exposed to other plugins as `api.whenSettled`. Callers should keep their own
 * deadline on top: this is bounded, but a print must never depend on someone
 * else's ceiling.
 */
export async function whenSettled(
  el: HTMLElement,
  options?: { quietMs?: number; maxMs?: number },
): Promise<void> {
  const quietMs = options?.quietMs ?? SETTLE_QUIET_MS;
  const maxMs = options?.maxMs ?? SETTLE_MAX_MS;
  const win = ownerWindow(el);
  await nextFrame(win);
  await nextFrame(win);
  // The image step shares the ceiling: a lazy-loaded image that never scrolls
  // into view fires neither load nor error, and "settled" must still return.
  const images = Array.from(el.querySelectorAll("img")).map(whenImageSettled);
  await Promise.race([
    Promise.all(images),
    new Promise<void>(resolve => win.setTimeout(resolve, maxMs)),
  ]);
  await waitForQuiescence(el, quietMs, maxMs);
}
