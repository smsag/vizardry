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

const { mockGetLinearService, mockGetUpvotyService } = vi.hoisted(() => ({
  mockGetLinearService: vi.fn(),
  mockGetUpvotyService: vi.fn(),
}));
vi.mock("../linear", () => ({ getLinearService: mockGetLinearService }));
vi.mock("../upvoty", () => ({ getUpvotyService: mockGetUpvotyService }));

import { initCanvas, renderHeadingLink } from "./controls";

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  mockGetLinearService.mockReset();
  mockGetUpvotyService.mockReset();
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

describe("renderHeadingLink — ticket fallback", () => {
  it("renders a Linear ticket badge when resolve() finds nothing but resolveTicket() does", () => {
    mockGetLinearService.mockReturnValue({ isEnabled: () => true });
    const el = container();
    const resolver = {
      resolve: () => undefined,
      resolveTicket: () => ({ service: "linear" as const, key: "CORE-1234" }),
    };
    renderHeadingLink(el, "Fix login bug", resolver, undefined);

    const badge = el.querySelector(".vzd-linear-key");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("CORE-1234");
    expect(el.querySelector(".vzd-card-link-btn")).toBeNull();
  });

  it("renders an Upvoty ticket badge when resolve() finds nothing but resolveTicket() does", () => {
    mockGetUpvotyService.mockReturnValue({ isEnabled: () => true });
    const el = container();
    const resolver = {
      resolve: () => undefined,
      resolveTicket: () => ({ service: "upvoty" as const, key: "UPV-abc123" }),
    };
    renderHeadingLink(el, "Add dark mode", resolver, undefined);

    expect(el.querySelector(".vzd-upvoty-key")).toBeTruthy();
  });

  it("prefers the heading link over a ticket annotation when both resolve", () => {
    mockGetLinearService.mockReturnValue({ isEnabled: () => true });
    const el = container();
    const resolver = {
      resolve: () => "Some Heading",
      resolveTicket: () => ({ service: "linear" as const, key: "CORE-1234" }),
    };
    renderHeadingLink(el, "Fix login bug", resolver, () => {});

    expect(el.querySelector(".vzd-card-link-btn")).toBeTruthy();
    expect(el.querySelector(".vzd-linear-key")).toBeNull();
  });

  it("renders nothing when neither resolve() nor resolveTicket() find a match", () => {
    const el = container();
    const resolver = { resolve: () => undefined, resolveTicket: () => undefined };
    renderHeadingLink(el, "Untracked item", resolver, undefined);

    expect(el.children.length).toBe(0);
  });
});
