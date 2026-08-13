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

import { initCanvas, renderHeadingLink, expandForCapture, revealForCapture } from "./controls";

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

  it("ignores the immediate CM6 focus-steal blur so the edit isn't committed before the user types", () => {
    // Regression: on an untitled canvas the default title is the framework name.
    // In Live Preview, .focus() triggers an immediate blur (CM6 steals focus
    // back); without a guard that blur commits straight away and the title
    // snaps back to the framework name — "the type is shown, not the title set".
    vi.useFakeTimers();
    const el = container();
    const onTitleEdit = vi.fn();
    initCanvas(el, "bmc", "Business Model Canvas", undefined, "source", onTitleEdit, undefined);
    const span = el.querySelector<HTMLElement>(".vizardry-title--editable")!;

    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // A blur that fires within the guard window (the focus-steal) must be ignored.
    span.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
    expect(onTitleEdit).not.toHaveBeenCalled();
    expect(span.classList.contains("vizardry-title--editing")).toBe(true); // still editing

    // The user types a real title; after the guard window, a genuine blur commits.
    span.textContent = "My Company";
    vi.advanceTimersByTime(200);
    span.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
    expect(onTitleEdit).toHaveBeenCalledWith("My Company");

    vi.useRealTimers();
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

describe("expandForCapture", () => {
  it("neutralises a horizontal scroller to its full width, then restores it exactly", () => {
    const el = document.createElement("div");
    el.style.overflowX = "auto";
    el.style.width = "400px";
    document.body.appendChild(el);
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 1200 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 400 });
    const before = el.getAttribute("style");

    const restore = expandForCapture(el, window);
    expect(el.style.overflow).toBe("visible");
    expect(el.style.width).toBe("1200px");

    restore();
    expect(el.getAttribute("style")).toBe(before);
  });

  it("is a no-op for a non-overflowing element (desktop path unchanged)", () => {
    const el = document.createElement("div");
    el.style.overflowX = "auto";
    document.body.appendChild(el);
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 300 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
    const before = el.getAttribute("style");

    expandForCapture(el, window)();
    expect(el.getAttribute("style")).toBe(before);
  });

  it("only touches auto/scroll overflow, never hidden (decorative clips)", () => {
    const el = document.createElement("div");
    el.style.overflow = "hidden";
    document.body.appendChild(el);
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 1200 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 400 });
    const before = el.getAttribute("style");

    expandForCapture(el, window)();
    expect(el.getAttribute("style")).toBe(before);
  });
});

describe("revealForCapture", () => {
  it("adds the vizardry-capturing class, then restores the canvas exactly", () => {
    const el = document.createElement("div");
    el.className = "vizardry-canvas";
    document.body.appendChild(el);
    const before = el.getAttribute("class");

    const restore = revealForCapture(el);
    expect(el.classList.contains("vizardry-capturing")).toBe(true);

    restore();
    expect(el.classList.contains("vizardry-capturing")).toBe(false);
    expect(el.getAttribute("class")).toBe(before);
  });

  it("resets a collapsed Story column carousel to the full grid, then restores it byte-for-byte", () => {
    const el = document.createElement("div");
    el.className = "vizardry-canvas";
    const grid = document.createElement("div");
    grid.className = "vzd-story-grid";
    grid.style.gridTemplateColumns = "1fr"; // mobile-collapsed
    const activity = document.createElement("div");
    activity.className = "vzd-story-activity-header";
    activity.dataset.origGridCol = "2 / 5";
    activity.style.display = "none";
    activity.style.gridColumn = "1 / 2";
    const cell = document.createElement("div");
    cell.className = "vzd-story-cell";
    cell.style.display = "none";
    grid.append(activity, cell);
    el.appendChild(grid);
    document.body.appendChild(el);

    const gridBefore = grid.getAttribute("style");
    const activityBefore = activity.getAttribute("style");
    const cellBefore = cell.getAttribute("style");

    const restore = revealForCapture(el);
    // Collapse undone: the narrowed template is cleared and hidden cells shown.
    expect(grid.style.gridTemplateColumns).toBe("");
    expect(activity.style.display).toBe("");
    expect(activity.style.gridColumn).toBe("2 / 5"); // restored from origGridCol
    expect(cell.style.display).toBe("");

    restore();
    expect(grid.getAttribute("style")).toBe(gridBefore);
    expect(activity.getAttribute("style")).toBe(activityBefore);
    expect(cell.getAttribute("style")).toBe(cellBefore);
  });

  it("is a byte-for-byte no-op for a canvas with no carousel (SVG canvases, desktop)", () => {
    const el = document.createElement("div");
    el.className = "vizardry-canvas";
    el.innerHTML = `<div class="vzd-wardley-wrap"><svg></svg></div>`;
    document.body.appendChild(el);
    const before = el.outerHTML;

    revealForCapture(el)();
    expect(el.outerHTML).toBe(before);
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

  it("excludes interaction chrome from the capture but keeps content and link indicators", async () => {
    const el = container();
    initCanvas(el, "wardley", "My Map", undefined, "source", undefined, undefined);
    clickDownload(el);
    await vi.waitFor(() => expect(mockToBlob).toHaveBeenCalled());

    const filter = mockToBlob.mock.calls[0][1].filter as (n: Node) => boolean;
    const node = (cls: string): HTMLElement => {
      const d = document.createElement("div");
      d.className = cls;
      return d;
    };

    // Chrome — toolbar, carousel nav, and inline edit affordances — is dropped.
    for (const c of [
      "vizardry-header-actions",
      "vizardry-nav", "vzd-story-nav", "vzd-journey-nav",
      "vzd-journey-card-delete", "vzd-story-task-delete",
      "vzd-scqa-card-add", "vzd-scqa-card-del", "vzd-roadmap-add-item",
      "vzd-wardley-unlink-btn", "vzd-wardley-add-handle-g",
      "vzd-tree-edit-add", "vzd-tree-edit-del",
      "vzd-lane-bullet-add", "vzd-lane-bullet-del",
      "vzd-nodemap-box-delete-btn",
    ]) {
      expect(filter(node(c)), `${c} should be excluded`).toBe(false);
    }

    // Content and link indicators are kept.
    for (const c of [
      "vizardry-block", "vzd-mx-pill", "vzd-journey-card",
      "vzd-card-link-btn", "vizardry-block-link-btn",
    ]) {
      expect(filter(node(c)), `${c} should be kept`).toBe(true);
    }

    // Text nodes (no classList) are kept.
    expect(filter(document.createTextNode("hi"))).toBe(true);
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

  it("mobile: exports the full canvas, not just the visible slice, when it overflows the viewport", async () => {
    // Repro: a canvas wider (and taller) than a phone viewport. Before the fix
    // the export captured only the on-screen slice.
    mockPlatform.isMobile = true;
    mockPlatform.isDesktop = false;
    (window.navigator as any).share = vi.fn().mockResolvedValue(undefined);
    (window.navigator as any).canShare = vi.fn(() => true);

    const el = container();
    initCanvas(el, "scqa", "Wide", undefined, "source", undefined, undefined);
    el.style.overflowX = "auto";
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 1600 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 390 });
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 900 });

    clickDownload(el);
    await vi.waitFor(() => expect(mockToBlob).toHaveBeenCalled());

    const opts = mockToBlob.mock.calls[0][1];
    expect(opts.width).toBe(1600);   // full width, not the 390px viewport slice
    expect(opts.height).toBe(900);
    // Layout restored after capture — no leftover expansion left on the canvas.
    expect(el.style.overflow).toBe("");

    delete (window.navigator as any).share;
    delete (window.navigator as any).canShare;
  });

  it("mobile: reveals carousel-collapsed panels during capture, then restores the canvas", async () => {
    // A grid canvas is carousel-collapsed on mobile; the export must un-collapse
    // it while html-to-image reads styles, then leave the live canvas untouched.
    mockPlatform.isMobile = true;
    mockPlatform.isDesktop = false;
    (window.navigator as any).share = vi.fn().mockResolvedValue(undefined);
    (window.navigator as any).canShare = vi.fn(() => true);

    const el = container();
    initCanvas(el, "bmc", "Model", undefined, "source", undefined, undefined);
    // The grid a framework renderer would produce (custom props + a block).
    const grid = el.createEl("div", { cls: "vizardry-grid" });
    const block = grid.createEl("div", { cls: "vizardry-block" });

    let capturingDuringToBlob: boolean | null = null;
    mockToBlob.mockImplementation((node: HTMLElement) => {
      capturingDuringToBlob = node.classList.contains("vizardry-capturing");
      return Promise.resolve(new Blob(["png"], { type: "image/png" }));
    });

    clickDownload(el);
    await vi.waitFor(() => expect(mockToBlob).toHaveBeenCalled());

    // Present while the styles were being read…
    expect(capturingDuringToBlob).toBe(true);
    // …and fully cleaned up afterwards — no leftover class on the live canvas.
    expect(el.classList.contains("vizardry-capturing")).toBe(false);
    expect(block.classList.contains("vizardry-capturing")).toBe(false);

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
