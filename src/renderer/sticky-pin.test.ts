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

import "../test-setup";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { activateSticky, deactivateSticky } from "./sticky-pin";
import { setupSlideCarousel } from "./grid-carousel";

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

describe("sticky-pin carousel", () => {
  /** A grid canvas with `n` blocks and its (desktop-width, so inactive)
   *  carousel, as renderCanvas builds it. */
  function makeGridCanvas(name: string, off: number, n: number): HTMLElement {
    const el = makeCanvas(name, off);
    const grid = el.createEl("div", { cls: "vizardry-grid" });
    for (let i = 0; i < n; i++) grid.createEl("div", { cls: "vizardry-block", text: `Block ${i + 1}` });
    setupSlideCarousel(el, ".vizardry-block", "vizardry-block-active", n);
    return el;
  }

  function pinnedClone(): HTMLElement {
    return viewContent.querySelector<HTMLElement>(".vizardry-canvas--pinned")!;
  }

  function activeBlock(root: HTMLElement): string | null {
    return root.querySelector(".vizardry-block-active")?.textContent ?? null;
  }

  function navButtons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll<HTMLButtonElement>(".vizardry-nav-btn"));
  }

  it("browses the pinned clone one block at a time while the live canvas keeps its grid", () => {
    const a = makeGridCanvas("A", 300, 3);
    activateSticky(a);
    scrollTo(350);

    const clone = pinnedClone();
    expect(clone.classList.contains("vzd-carousel")).toBe(true);
    expect(a.classList.contains("vzd-carousel")).toBe(false);
    expect(activeBlock(clone)).toBe("Block 1");

    // Exactly one live nav: the copied (listener-less) one is replaced.
    expect(clone.querySelectorAll(".vizardry-nav")).toHaveLength(1);
    const [prev, next] = navButtons(clone);
    expect(prev.disabled).toBe(true);

    next.click();
    expect(activeBlock(clone)).toBe("Block 2");
    next.click();
    expect(activeBlock(clone)).toBe("Block 3");
    expect(next.disabled).toBe(true);
    prev.click();
    expect(activeBlock(clone)).toBe("Block 2");

    // The source's blocks are untouched.
    expect(activeBlock(a)).toBeNull();
  });

  it("returns to the same block after unpinning and pinning again", () => {
    const a = makeGridCanvas("A", 300, 3);
    activateSticky(a);
    scrollTo(350);
    navButtons(pinnedClone())[1].click();
    expect(activeBlock(pinnedClone())).toBe("Block 2");

    scrollTo(100); // released
    expect(pinnedName()).toBeNull();
    scrollTo(350); // pinned again
    expect(activeBlock(pinnedClone())).toBe("Block 2");
  });

  it("keeps the clone's nav out of the tab order", () => {
    const a = makeGridCanvas("A", 300, 2);
    activateSticky(a);
    scrollTo(350);
    expect(navButtons(pinnedClone()).map((b) => b.tabIndex)).toEqual([-1, -1]);
  });

  it("leaves a canvas without blocks as a plain clone", () => {
    const a = makeCanvas("A", 300);
    activateSticky(a);
    scrollTo(350);
    const clone = pinnedClone();
    expect(clone.classList.contains("vzd-carousel")).toBe(false);
    expect(clone.querySelector(".vizardry-nav")).toBeNull();
  });
});
