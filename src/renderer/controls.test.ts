// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  moment: { locale: () => "en" },
}));
vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
}));

import { initCanvas } from "./controls";

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("editable title — keydown listener lifecycle", () => {
  it("does not accumulate keydown listeners across repeated edit/cancel cycles", () => {
    const el = container();
    initCanvas(el, "test", "My Title", undefined, "source", () => {}, undefined);
    const span = el.querySelector<HTMLElement>(".vizardry-title--editable")!;
    expect(span).toBeTruthy();

    let liveKeydownListeners = 0;
    const originalAdd = HTMLElement.prototype.addEventListener;
    const originalRemove = HTMLElement.prototype.removeEventListener;
    vi.spyOn(HTMLElement.prototype, "addEventListener").mockImplementation(function (this: HTMLElement, type: string, ...rest: any[]) {
      if (this === span && type === "keydown") liveKeydownListeners++;
      return originalAdd.call(this, type, ...(rest as [any, any]));
    });
    vi.spyOn(HTMLElement.prototype, "removeEventListener").mockImplementation(function (this: HTMLElement, type: string, ...rest: any[]) {
      if (this === span && type === "keydown") liveKeydownListeners--;
      return originalRemove.call(this, type, ...(rest as [any, any]));
    });

    // Three separate edit sessions, each cancelled via Escape.
    for (let i = 0; i < 3; i++) {
      span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      span.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }

    expect(liveKeydownListeners).toBe(0);

    vi.restoreAllMocks();
  });

  it("removes the keydown listener on commit (Enter), not just on cancel", () => {
    const el = container();
    const onTitleEdit = vi.fn();
    initCanvas(el, "test", "My Title", undefined, "source", onTitleEdit, undefined);
    const span = el.querySelector<HTMLElement>(".vizardry-title--editable")!;

    let liveKeydownListeners = 0;
    const originalAdd = HTMLElement.prototype.addEventListener;
    const originalRemove = HTMLElement.prototype.removeEventListener;
    vi.spyOn(HTMLElement.prototype, "addEventListener").mockImplementation(function (this: HTMLElement, type: string, ...rest: any[]) {
      if (this === span && type === "keydown") liveKeydownListeners++;
      return originalAdd.call(this, type, ...(rest as [any, any]));
    });
    vi.spyOn(HTMLElement.prototype, "removeEventListener").mockImplementation(function (this: HTMLElement, type: string, ...rest: any[]) {
      if (this === span && type === "keydown") liveKeydownListeners--;
      return originalRemove.call(this, type, ...(rest as [any, any]));
    });

    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(liveKeydownListeners).toBe(1);
    span.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(liveKeydownListeners).toBe(0);
    expect(onTitleEdit).toHaveBeenCalledWith("My Title");

    vi.restoreAllMocks();
  });
});
