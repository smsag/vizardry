// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { watchOverflowHint, OVERFLOW_RIGHT_CLS } from "./overflow-hint";

/** A div whose scroll geometry the test controls. */
function scroller(scrollWidth: number, clientWidth: number): HTMLElement & { scrollLeft: number } {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollWidth", { get: () => scrollWidth });
  Object.defineProperty(el, "clientWidth", { get: () => clientWidth });
  let left = 0;
  Object.defineProperty(el, "scrollLeft", { get: () => left, set: (v: number) => { left = v; } });
  document.body.appendChild(el);
  return el as HTMLElement & { scrollLeft: number };
}

describe("watchOverflowHint", () => {
  it("marks an area with more to the right, and clears it once scrolled to the end", () => {
    const el = scroller(1000, 300);
    watchOverflowHint(el);
    el.dispatchEvent(new Event("scroll"));
    expect(el.classList.contains(OVERFLOW_RIGHT_CLS)).toBe(true);
    el.scrollLeft = 700;
    el.dispatchEvent(new Event("scroll"));
    expect(el.classList.contains(OVERFLOW_RIGHT_CLS)).toBe(false);
  });

  it("leaves an area that fits unmarked", () => {
    const el = scroller(300, 300);
    watchOverflowHint(el);
    el.dispatchEvent(new Event("scroll"));
    expect(el.classList.contains(OVERFLOW_RIGHT_CLS)).toBe(false);
  });
});
