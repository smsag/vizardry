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

import { attachItemMenu, attachSvgItemMenu, LONG_PRESS_MS } from "./item-menu";

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
    const { button: btn } = attachItemMenu(el, { actions, label: "Actions for CORE-1", button: { parent: el, cls: "vzd-item-menu-btn" } });
    expect(btn).not.toBeNull();
    expect(btn!.tagName).toBe("BUTTON");
    expect(btn!.getAttribute("type")).toBe("button");
    expect(btn!.getAttribute("aria-label")).toBe("Actions for CORE-1");
    expect(btn!.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("opens the menu when clicked", () => {
    const el = host();
    const { button: btn } = attachItemMenu(el, { actions, label: "x", button: { parent: el, cls: "c" } });
    btn!.click();
    expect(shown).toHaveLength(1);
    expect(built.map(b => b.title)).toEqual(["Delete task"]);
  });

  it("carries the shared trigger class and a placement, defaulting to the corner", () => {
    const el = host();
    const corner = attachItemMenu(el, { actions, label: "x", button: { parent: el, cls: "c" } }).button!;
    expect([...corner.classList]).toEqual(["vzd-item-menu", "vzd-item-menu--corner", "c"]);
    const row = attachItemMenu(el, { actions, label: "x", button: { parent: el, cls: "c", placement: "row" } }).button!;
    expect(row.classList.contains("vzd-item-menu--row")).toBe(true);
  });

  it("marks its host, so hovering the item reveals the trigger", () => {
    const el = host();
    attachItemMenu(el, { actions, label: "x", button: { parent: el, cls: "c" } });
    expect(el.classList.contains("vzd-item-host")).toBe(true);
  });

  it("is omitted for a host that supplies its own trigger", () => {
    // SVG canvases cannot contain an HTML button.
    expect(attachItemMenu(host(), { actions, label: "x" }).button).toBeNull();
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

describe("nested hosts", () => {
  // An OST bullet row is an item inside its node, which is an item too.
  function nested(): { outer: HTMLElement; inner: HTMLElement; outerDel: ReturnType<typeof vi.fn> } {
    const outer = host();
    const inner = outer.createEl("div");
    const outerDel = vi.fn();
    attachItemMenu(outer, { actions: () => [{ title: "Delete node", onChoose: outerDel }], label: "x" });
    attachItemMenu(inner, { actions, label: "y" });
    return { outer, inner, outerDel };
  }

  it("right-click on the inner item opens only its menu", () => {
    const { inner } = nested();
    inner.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(shown).toHaveLength(1);
    expect(built.map(b => b.title)).toEqual(["Delete task"]);
  });

  it("a long press on the inner item opens only its menu", () => {
    vi.useFakeTimers();
    const { inner } = nested();
    pointer(inner, "pointerdown");
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(shown).toHaveLength(1);
    expect(built.map(b => b.title)).toEqual(["Delete task"]);
  });
});

describe("the SVG trigger", () => {
  const NS = "http://www.w3.org/2000/svg";
  function svgHost(): SVGGElement {
    const svg = document.createElementNS(NS, "svg");
    document.body.appendChild(svg);
    const g = document.createElementNS(NS, "g") as SVGGElement;
    svg.appendChild(g);
    return g;
  }

  it("is a keyboard-operable, labelled button drawn as a direct child of its item", () => {
    const g = svgHost();
    attachSvgItemMenu(g, { actions, label: "Actions for Leaf", x: 10, y: 20 });
    const trigger = g.querySelector(":scope > .vzd-item-menu")!;
    expect(trigger).toBeTruthy();
    expect(trigger.classList.contains("vzd-item-menu--svg")).toBe(true);
    expect(trigger.getAttribute("role")).toBe("button");
    expect(trigger.getAttribute("tabindex")).toBe("0");
    expect(trigger.getAttribute("aria-label")).toBe("Actions for Leaf");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("transform")).toBe("translate(10, 20)");
    expect(g.classList.contains("vzd-item-host")).toBe(true);
  });

  it("opens the menu on click and on Enter, and never deletes by itself", () => {
    const g = svgHost();
    attachSvgItemMenu(g, { actions, label: "x", x: 0, y: 0 });
    const trigger = g.querySelector(".vzd-item-menu")!;
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(shown).toHaveLength(2);
    expect(del).not.toHaveBeenCalled();
  });

  it("keeps a press on it from reaching the item, so it never starts a drag", () => {
    const g = svgHost();
    const onItemDown = vi.fn();
    g.addEventListener("pointerdown", onItemDown);
    attachSvgItemMenu(g, { actions, label: "x", x: 0, y: 0 });
    pointer(g.querySelector(".vzd-item-menu")!, "pointerdown", { pointerType: "mouse" });
    expect(onItemDown).not.toHaveBeenCalled();
  });

  it("moves with its item, and offers an opaque variant for a link's midpoint", () => {
    const g = svgHost();
    const h = attachSvgItemMenu(g, { actions, label: "x", x: 0, y: 0, floating: true });
    h.moveTo(5, 6);
    const trigger = g.querySelector(".vzd-item-menu")!;
    expect(trigger.getAttribute("transform")).toBe("translate(5, 6)");
    expect(trigger.classList.contains("vzd-item-menu--floating")).toBe(true);
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

describe("a host that supplies its own trigger", () => {
  it("exposes open() so an SVG trigger can drive the same menu", () => {
    const el = host();
    const { open } = attachItemMenu(el, { actions, label: "x" });
    open(11, 22);
    expect(shown).toEqual([{ x: 11, y: 22 }]);
  });
});
