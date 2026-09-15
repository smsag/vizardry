// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Captures what was put into the Menu, and where it was shown. */
const shown: { x: number; y: number }[] = [];
let built: { title: string; icon?: string; warning?: boolean; click?: () => void }[] = [];

vi.mock("obsidian", () => {
  class Menu {
    addItem(cb: (item: unknown) => void) {
      const rec: { title: string; icon?: string; warning?: boolean; click?: () => void } = { title: "" };
      cb({
        setTitle: (t: string) => { rec.title = t; return this; },
        setIcon: (i: string) => { rec.icon = i; return this; },
        setWarning: (w: boolean) => { rec.warning = w; return this; },
        onClick: (fn: () => void) => { rec.click = fn; return this; },
      });
      built.push(rec);
      return this;
    }
    showAtPosition(pos: { x: number; y: number }) { shown.push(pos); return this; }
  }
  return { Menu, setIcon: vi.fn() };
});

import { attachItemMenu, LONG_PRESS_MS } from "./item-menu";

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const del = vi.fn();
const actions = () => [{ title: "Delete task", icon: "trash-2", destructive: true, onChoose: del }];

function pointer(el: Element, type: string, opts: Record<string, unknown> = {}): void {
  const e = new Event(type, { bubbles: true }) as PointerEvent & Record<string, unknown>;
  Object.assign(e, { pointerType: "touch", clientX: 10, clientY: 10, ...opts });
  el.dispatchEvent(e);
}

beforeEach(() => {
  shown.length = 0; built = []; del.mockClear();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("the ⋯ button", () => {
  it("is a labelled, typed button announcing that it opens a menu", () => {
    const el = host();
    const btn = attachItemMenu(el, { actions, label: "Actions for CORE-1", button: { parent: el, cls: "vzd-item-menu-btn" } })!;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-label")).toBe("Actions for CORE-1");
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("opens the menu when clicked", () => {
    const el = host();
    const btn = attachItemMenu(el, { actions, label: "x", button: { parent: el, cls: "c" } })!;
    btn.click();
    expect(shown).toHaveLength(1);
    expect(built.map(b => b.title)).toEqual(["Delete task"]);
  });

  it("is omitted for a host that supplies its own trigger", () => {
    // SVG canvases cannot contain an HTML button.
    expect(attachItemMenu(host(), { actions, label: "x" })).toBeNull();
  });
});

describe("right-click", () => {
  it("opens the menu at the pointer and suppresses the native one", () => {
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 42, clientY: 99 });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(shown).toEqual([{ x: 42, y: 99 }]);
  });
});

describe("long press", () => {
  it("opens the menu after a still touch", () => {
    vi.useFakeTimers();
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    pointer(el, "pointerdown");
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(shown).toHaveLength(1);
  });

  it("is cancelled by movement — that press is a drag or a scroll", () => {
    vi.useFakeTimers();
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    pointer(el, "pointerdown");
    pointer(el, "pointermove", { clientX: 40, clientY: 10 });
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(shown).toHaveLength(0);
  });

  it("is cancelled by lifting early", () => {
    vi.useFakeTimers();
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    pointer(el, "pointerdown");
    pointer(el, "pointerup");
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(shown).toHaveLength(0);
  });

  it("never arms for a mouse — right-click is the desktop route", () => {
    vi.useFakeTimers();
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    pointer(el, "pointerdown", { pointerType: "mouse" });
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(shown).toHaveLength(0);
  });
});

describe("menu contents", () => {
  it("marks a destructive action so the theme paints it red", () => {
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(built[0].warning).toBe(true);
    expect(built[0].icon).toBe("trash-2");
  });

  it("leaves a non-destructive action unmarked", () => {
    const el = host();
    attachItemMenu(el, {
      actions: () => [{ title: "Remove card", onChoose: vi.fn() }],
      label: "x",
    });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(built[0].warning).toBeUndefined();
  });

  it("runs the chosen action", () => {
    const el = host();
    attachItemMenu(el, { actions, label: "x" });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    built[0].click!();
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("rebuilds on every open, so a changed action list is never stale", () => {
    const el = host();
    let n = 1;
    attachItemMenu(el, { actions: () => Array.from({ length: n }, (_, i) => ({ title: `a${i}`, onChoose: vi.fn() })), label: "x" });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(built).toHaveLength(1);
    built = []; n = 3;
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(built).toHaveLength(3);
  });

  it("does not open an empty menu", () => {
    const el = host();
    attachItemMenu(el, { actions: () => [], label: "x" });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(shown).toHaveLength(0);
  });
});
