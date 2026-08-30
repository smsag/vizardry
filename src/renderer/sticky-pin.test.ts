// @vitest-environment happy-dom

/**
 * Tests for the sticky-pin selection logic (src/renderer/sticky-pin.ts).
 *
 * happy-dom has no layout engine, so every geometry input the controller reads
 * — the scroller's rect/offsetParent/scrollTop and each canvas's rect — is
 * stubbed. Each canvas is modelled by a fixed content offset `off`; its rect
 * top is derived from the current scrollTop exactly as a real browser would
 * report it (`chromeTop + off - scrollTop`). requestAnimationFrame is forced
 * synchronous so a dispatched "scroll" resolves before the assertion.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { activateSticky, deactivateSticky } from "./sticky-pin";

const CHROME_TOP = 100; // scroller's viewport top

let scrollTop = 0;
let scroller: HTMLElement;
let viewContent: HTMLElement;
let rafSpy: ReturnType<typeof vi.spyOn>;

function stubRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}), ...rect,
  }) as DOMRect;
}

/** A canvas at content offset `off`, whose rect tracks the live scrollTop. */
function makeCanvas(name: string, off: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "vizardry-canvas";
  el.dataset.name = name;
  el.getBoundingClientRect = () => {
    const top = CHROME_TOP + (off - scrollTop);
    return {
      top, bottom: top + 200, left: 100, right: 900, width: 800, height: 200,
      x: 100, y: top, toJSON: () => ({}),
    } as DOMRect;
  };
  scroller.appendChild(el);
  return el;
}

function scrollTo(y: number): void {
  scrollTop = y;
  scroller.dispatchEvent(new Event("scroll"));
}

function pinnedName(): string | null {
  const clone = viewContent.querySelector<HTMLElement>(".vizardry-canvas--pinned");
  return clone?.dataset.name ?? null;
}

beforeEach(() => {
  document.body.innerHTML = "";
  scrollTop = 0;

  viewContent = document.createElement("div");
  viewContent.className = "view-content";
  document.body.appendChild(viewContent);

  scroller = document.createElement("div");
  scroller.className = "markdown-preview-view";
  viewContent.appendChild(scroller);

  stubRect(scroller, { top: CHROME_TOP, bottom: 600, left: 0, right: 1000, width: 1000, height: 500 });
  Object.defineProperty(scroller, "offsetParent", { configurable: true, get: () => document.body });
  Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => scrollTop });

  // Force rAF synchronous so update() runs within the dispatch call.
  rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe("sticky-pin selection", () => {
  it("does nothing outside a reading-view scroller", () => {
    const orphan = document.createElement("div");
    document.body.appendChild(orphan);
    expect(() => activateSticky(orphan)).not.toThrow();
    expect(pinnedName()).toBeNull();
  });

  it("pins a canvas once its top scrolls under the chrome, and unpins when scrolled back", () => {
    const a = makeCanvas("A", 300);
    activateSticky(a);

    scrollTo(0);   // A.top = 400, below the fold → not pinned
    expect(pinnedName()).toBeNull();

    scrollTo(350); // A.top = 50, above the fold → pinned
    expect(pinnedName()).toBe("A");

    scrollTo(100); // A.top = 300, back below the fold → released
    expect(pinnedName()).toBeNull();
  });

  it("pins the lowest canvas scrolled past — only one at a time", () => {
    const a = makeCanvas("A", 300);
    const b = makeCanvas("B", 1000);
    activateSticky(a);
    activateSticky(b);

    scrollTo(400);  // only A passed
    expect(pinnedName()).toBe("A");

    scrollTo(1200); // both passed → B (lower in doc) wins
    expect(pinnedName()).toBe("B");

    scrollTo(500);  // back above B → A again
    expect(pinnedName()).toBe("A");
  });

  it("positions the pinned clone at the chrome top and the source's horizontal box", () => {
    const a = makeCanvas("A", 300);
    activateSticky(a);
    scrollTo(350);

    const clone = viewContent.querySelector<HTMLElement>(".vizardry-canvas--pinned")!;
    expect(clone.style.top).toBe(`${CHROME_TOP}px`);
    expect(clone.style.left).toBe("100px");
    expect(clone.style.width).toBe("800px");
    // Full-width inline transforms are neutralised on the clone.
    expect(clone.style.transform).toBe("none");
  });

  it("releases the pin when the pane is hidden (offsetParent null)", () => {
    const a = makeCanvas("A", 300);
    activateSticky(a);
    scrollTo(350);
    expect(pinnedName()).toBe("A");

    Object.defineProperty(scroller, "offsetParent", { configurable: true, get: () => null });
    scrollTo(360);
    expect(pinnedName()).toBeNull();
  });

  it("deactivateSticky removes an active clone", () => {
    const a = makeCanvas("A", 300);
    activateSticky(a);
    scrollTo(350);
    expect(pinnedName()).toBe("A");

    deactivateSticky(a);
    expect(pinnedName()).toBeNull();
  });
});
