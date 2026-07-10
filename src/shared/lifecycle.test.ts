// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onDisconnected } from "./lifecycle";

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("onDisconnected", () => {
  it("calls cleanup once when the element is removed from the DOM", async () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const el = parent.appendChild(document.createElement("span"));
    const cleanup = vi.fn();

    onDisconnected(el, cleanup);
    parent.removeChild(el);
    await flush();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not call cleanup while the element stays connected", async () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const el = parent.appendChild(document.createElement("span"));
    const cleanup = vi.fn();

    onDisconnected(el, cleanup);
    parent.appendChild(document.createElement("div")); // unrelated mutation
    await flush();

    expect(cleanup).not.toHaveBeenCalled();
  });

  it("uses a single shared MutationObserver for multiple elements under the same ancestor", async () => {
    const ctorSpy = vi.fn();
    const OriginalMO = globalThis.MutationObserver;
    class SpyingMO extends OriginalMO {
      constructor(cb: MutationCallback) { ctorSpy(); super(cb); }
    }
    globalThis.MutationObserver = SpyingMO;

    try {
      const parent = document.body.appendChild(document.createElement("div"));
      const elA = parent.appendChild(document.createElement("span"));
      const elB = parent.appendChild(document.createElement("span"));

      onDisconnected(elA, vi.fn());
      onDisconnected(elB, vi.fn());

      expect(ctorSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.MutationObserver = OriginalMO;
    }
  });

  it("fires each watched element's own cleanup independently, not the other's", async () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const elA = parent.appendChild(document.createElement("span"));
    const elB = parent.appendChild(document.createElement("span"));
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();

    onDisconnected(elA, cleanupA);
    onDisconnected(elB, cleanupB);

    parent.removeChild(elA);
    await flush();

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).not.toHaveBeenCalled();

    parent.removeChild(elB);
    await flush();

    expect(cleanupB).toHaveBeenCalledTimes(1);
  });

  it("dispose() cancels only its own watch, leaving a sibling's watch under the same ancestor active", async () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const elA = parent.appendChild(document.createElement("span"));
    const elB = parent.appendChild(document.createElement("span"));
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();

    const disposeA = onDisconnected(elA, cleanupA);
    onDisconnected(elB, cleanupB);

    disposeA(); // cancel watching elA early
    parent.removeChild(elA);
    parent.removeChild(elB);
    await flush();

    expect(cleanupA).not.toHaveBeenCalled(); // disposed before it could fire
    expect(cleanupB).toHaveBeenCalledTimes(1); // unaffected by elA's dispose
  });

  it("does not call cleanup twice for the same element across multiple mutation batches", async () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const el = parent.appendChild(document.createElement("span"));
    const cleanup = vi.fn();

    onDisconnected(el, cleanup);
    parent.removeChild(el);
    await flush();
    parent.appendChild(document.createElement("div")); // another mutation on the same ancestor
    await flush();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
