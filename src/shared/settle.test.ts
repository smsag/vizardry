// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { whenSettled } from "./settle";

describe("whenSettled", () => {
  it("resolves for a subtree that is already quiet", async () => {
    const el = document.createElement("div");
    el.innerHTML = "<span>done</span>";
    document.body.appendChild(el);
    await expect(whenSettled(el, { quietMs: 10, maxMs: 200 })).resolves.toBeUndefined();
  });

  it("resolves once mutations stop", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const timer = setTimeout(() => el.appendChild(document.createElement("span")), 5);
    await whenSettled(el, { quietMs: 20, maxMs: 500 });
    clearTimeout(timer);
    expect(el.children.length).toBe(1);
  });

  it("gives up at maxMs rather than hanging on a subtree that never settles", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    // Mutating faster than the quiet window: only the ceiling can end this.
    const interval = setInterval(() => { el.textContent = String(Math.random()); }, 5);
    try {
      const start = Date.now();
      await whenSettled(el, { quietMs: 1000, maxMs: 60 });
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      clearInterval(interval);
    }
  });

  it("does not wait forever on an image that never loads", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const img = document.createElement("img");
    // No src, `complete` stays false in happy-dom: neither load nor error fires.
    Object.defineProperty(img, "complete", { value: false });
    el.appendChild(img);
    const started = Date.now();
    await whenSettled(el, { quietMs: 10, maxMs: 100 });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
