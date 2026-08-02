// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPlatform = vi.hoisted(() => ({ isMobile: false, isDesktop: true }));
vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  moment: { locale: () => "en" },
  Platform: mockPlatform,
}));
const mockToBlob = vi.hoisted(() => vi.fn());
vi.mock("html-to-image", () => ({
  toBlob: mockToBlob,
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
  mockToBlob.mockReset();
  mockToBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  mockPlatform.isMobile = false;
  mockPlatform.isDesktop = true;
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

describe("download / export", () => {
  function clickDownload(el: HTMLElement): void {
    const btn = el.querySelector<HTMLButtonElement>(".vizardry-download-btn")!;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("desktop: renders to a blob and downloads via an in-document anchor", async () => {
    (URL as any).createObjectURL = vi.fn(() => "blob:mock-url");
    (URL as any).revokeObjectURL = vi.fn();

    let clicked: { download: string; href: string; inDoc: boolean } | null = null;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked = { download: this.download, href: this.href, inDoc: document.body.contains(this) };
      });

    const el = container();
    initCanvas(el, "wardley", "My Map", undefined, "source", undefined, undefined);
    clickDownload(el);

    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(mockToBlob).toHaveBeenCalledTimes(1);
    expect((URL as any).createObjectURL).toHaveBeenCalledTimes(1);
    // The anchor carried the filename and was attached to the DOM when clicked.
    expect(clicked!.download).toBe("My Map.png");
    expect(clicked!.href).toBe("blob:mock-url");
    expect(clicked!.inDoc).toBe(true);
    // It is removed again after the click.
    expect(document.querySelector("a[download]")).toBeNull();

    clickSpy.mockRestore();
  });

  it("mobile: shares the PNG file via the system share sheet, not a download anchor", async () => {
    mockPlatform.isMobile = true;
    mockPlatform.isDesktop = false;
    const shareMock = vi.fn().mockResolvedValue(undefined);
    (window.navigator as any).share = shareMock;
    (window.navigator as any).canShare = vi.fn(() => true);
    (URL as any).createObjectURL = vi.fn(() => "blob:mock-url");

    const el = container();
    initCanvas(el, "wardley", "My Map", undefined, "source", undefined, undefined);
    clickDownload(el);

    await vi.waitFor(() => expect(shareMock).toHaveBeenCalled());
    const arg = shareMock.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe("My Map.png");
    expect(arg.files[0].type).toBe("image/png");
    // Share path returns early — no anchor download fallback runs.
    expect((URL as any).createObjectURL).not.toHaveBeenCalled();

    delete (window.navigator as any).share;
    delete (window.navigator as any).canShare;
  });

  it("mobile: falls back to the anchor download when the WebView cannot share files", async () => {
    mockPlatform.isMobile = true;
    mockPlatform.isDesktop = false;
    // share exists but canShare rejects files (common in locked-down WebViews).
    (window.navigator as any).share = vi.fn();
    (window.navigator as any).canShare = vi.fn(() => false);
    (URL as any).createObjectURL = vi.fn(() => "blob:mock-url");
    (URL as any).revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const el = container();
    initCanvas(el, "wardley", "My Map", undefined, "source", undefined, undefined);
    clickDownload(el);

    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect((window.navigator as any).share).not.toHaveBeenCalled();
    expect((URL as any).createObjectURL).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
    delete (window.navigator as any).share;
    delete (window.navigator as any).canShare;
  });
});
