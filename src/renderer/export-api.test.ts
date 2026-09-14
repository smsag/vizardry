// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPlatform = vi.hoisted(() => ({ isMobile: false, isDesktop: true }));
vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  moment: { locale: () => "en" },
  Platform: mockPlatform,
  MarkdownView: class MarkdownView {},
  Notice: vi.fn(),
}));
const mockToBlob = vi.hoisted(() => vi.fn());
vi.mock("html-to-image", () => ({ toBlob: mockToBlob }));

// bestTextColor is mocked so the re-resolve step is observable: the fake records
// whether the light class was already on the root when it ran, which is the
// ordering the contract depends on.
const { mockBestTextColor, bestTextColorCalls } = vi.hoisted(() => {
  const bestTextColorCalls: Array<{ rootHadLight: boolean }> = [];
  return {
    bestTextColorCalls,
    mockBestTextColor: vi.fn((el: Element) => {
      const root = el.closest(".vizardry-canvas");
      bestTextColorCalls.push({ rootHadLight: !!root?.classList.contains("theme-light") });
      return "#111111";
    }),
  };
});
vi.mock("../shared/color-utils", () => ({ bestTextColor: mockBestTextColor }));

vi.mock("../linear", () => ({ getLinearService: vi.fn() }));
vi.mock("../upvoty", () => ({ getUpvotyService: vi.fn() }));

import {
  createApi,
  exportCanvas,
  getCanvases,
  resolveExportOptions,
  VIZARDRY_NO_ENRICH_CLASS,
} from "./export-api";
import { AUTO_TEXT_ATTR, DEFAULT_MAX_EDGE, MIN_CAPTURE_SCALE, initCanvas } from "./controls";
import { VizardryExportError } from "../shared/export-error";

/** A minimal rendered canvas: the root class, a title row, and some content. */
function canvas(options: { collapsed?: boolean; title?: string } = {}): HTMLElement {
  const el = document.createElement("div");
  el.className = "vizardry-canvas";
  if (options.collapsed) el.classList.add("vizardry-canvas--minimized");
  el.dataset.canvasTitle = (options.title ?? "My Map").toLowerCase();
  const header = el.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { cls: "vizardry-title", text: options.title ?? "My Map" });
  header.createEl("div", { cls: "vizardry-header-actions" });
  el.createEl("div", { cls: "vizardry-grid", text: "content" });
  document.body.appendChild(el);
  return el;
}

function sizeOf(el: HTMLElement, width: number, height: number): void {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: width });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: height });
}

/** The options html-to-image was called with on the Nth capture. */
function blobOptions(call = 0): Record<string, unknown> {
  return mockToBlob.mock.calls[call][1] as Record<string, unknown>;
}

beforeEach(() => {
  document.body.innerHTML = "";
  mockToBlob.mockReset();
  mockToBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  mockBestTextColor.mockClear();
  bestTextColorCalls.length = 0;
});

describe("the API object", () => {
  it("is frozen, reports version 1, and publishes the no-enrich class", () => {
    const api = createApi();
    expect(api.version).toBe(1);
    expect(api.noEnrichClass).toBe(VIZARDRY_NO_ENRICH_CLASS);
    expect(Object.isFrozen(api)).toBe(true);
    // The three callable members a consumer duck-types before using the API.
    expect(typeof api.getCanvases).toBe("function");
    expect(typeof api.whenSettled).toBe("function");
    expect(typeof api.exportCanvas).toBe("function");
  });
});

describe("getCanvases", () => {
  it("returns every canvas in document order, the root included", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const first = canvas({ title: "First" });
    const second = canvas({ title: "Second" });
    host.append(first, second);

    expect(getCanvases(host)).toEqual([first, second]);
    // A canvas passed as the root counts as itself, and isn't duplicated.
    expect(getCanvases(first)).toEqual([first]);
  });

  it("includes collapsed canvases — they export in full, so they must be found", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const collapsed = canvas({ collapsed: true });
    host.appendChild(collapsed);
    expect(getCanvases(host)).toEqual([collapsed]);
  });
});

describe("option normalisation", () => {
  it("defaults to scale 2, light, white, with the title row and the default ceiling", () => {
    expect(resolveExportOptions()).toEqual({
      scale: 2,
      maxEdge: DEFAULT_MAX_EDGE,
      light: true,
      background: "#ffffff",
      header: true,
    });
  });

  it("clamps the scale and ignores junk rather than capturing at a nonsense size", () => {
    expect(resolveExportOptions({ scale: 99 }).scale).toBe(4);
    expect(resolveExportOptions({ scale: 0.01 }).scale).toBe(MIN_CAPTURE_SCALE);
    expect(resolveExportOptions({ scale: 0 }).scale).toBe(2);
    expect(resolveExportOptions({ scale: Number.NaN }).scale).toBe(2);
    expect(resolveExportOptions({ maxEdge: -1 }).maxEdge).toBe(DEFAULT_MAX_EDGE);
    expect(resolveExportOptions({ background: "   " }).background).toBe("#ffffff");
  });

  it("honours explicit false for light and header", () => {
    expect(resolveExportOptions({ light: false, header: false })).toMatchObject({
      light: false,
      header: false,
    });
  });
});

describe("exportCanvas rejections", () => {
  it("rejects a non-canvas element with not-a-canvas", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    await expect(exportCanvas(el)).rejects.toMatchObject({ code: "not-a-canvas" });
    expect(mockToBlob).not.toHaveBeenCalled();
  });

  it("rejects a detached canvas with not-rendered", async () => {
    const el = canvas();
    el.remove();
    await expect(exportCanvas(el)).rejects.toMatchObject({ code: "not-rendered" });
    expect(mockToBlob).not.toHaveBeenCalled();
  });

  it("rejects an unsupported format", async () => {
    const el = canvas();
    await expect(
      exportCanvas(el, { format: "svg" as unknown as "png" }),
    ).rejects.toBeInstanceOf(VizardryExportError);
  });

  it("reports capture-failed, and restores the canvas, when html-to-image throws", async () => {
    const el = canvas({ collapsed: true });
    const before = el.outerHTML;
    mockToBlob.mockRejectedValueOnce(new Error("boom"));

    await expect(exportCanvas(el)).rejects.toMatchObject({ code: "capture-failed" });
    expect(el.outerHTML).toBe(before);
  });

  it("reports capture-failed on an empty blob", async () => {
    const el = canvas();
    mockToBlob.mockResolvedValueOnce(null);
    await expect(exportCanvas(el)).rejects.toMatchObject({ code: "capture-failed" });
  });
});

describe("exportCanvas result", () => {
  it("captures at the requested scale and reports actual pixels and the displayed title", async () => {
    const el = canvas({ title: "My Map" });
    sizeOf(el, 800, 600);

    const result = await exportCanvas(el, { scale: 2 });

    expect(blobOptions()).toMatchObject({ pixelRatio: 2, backgroundColor: "#ffffff", width: 800, height: 600 });
    expect(result).toMatchObject({ format: "png", scale: 2, width: 1600, height: 1200, title: "My Map" });
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it("reduces the scale to fit maxEdge instead of refusing a wide canvas", async () => {
    const el = canvas();
    sizeOf(el, 5000, 1000);

    const result = await exportCanvas(el, { scale: 2, maxEdge: 4000 });

    expect(result.scale).toBeCloseTo(0.8);
    expect(result.width).toBe(4000);
    expect(blobOptions().pixelRatio).toBeCloseTo(0.8);
  });

  it("rejects too-large only when even the lowest scale cannot fit", async () => {
    const el = canvas();
    sizeOf(el, 100_000, 1000);
    await expect(exportCanvas(el, { maxEdge: 4000 })).rejects.toMatchObject({ code: "too-large" });
  });
});

describe("what ends up in the image", () => {
  it("always filters interaction chrome, and the title row only when asked", async () => {
    const el = canvas();
    const header = el.querySelector<HTMLElement>(".vizardry-header")!;
    const actions = el.querySelector<HTMLElement>(".vizardry-header-actions")!;
    const content = el.querySelector<HTMLElement>(".vizardry-grid")!;

    await exportCanvas(el);
    const keep = blobOptions().filter as (n: Node) => boolean;
    expect(keep(actions)).toBe(false);
    expect(keep(header)).toBe(true);
    expect(keep(content)).toBe(true);

    await exportCanvas(el, { header: false });
    const keepNoHeader = blobOptions(1).filter as (n: Node) => boolean;
    expect(keepNoHeader(header)).toBe(false);
    expect(keepNoHeader(actions)).toBe(false);
    expect(keepNoHeader(content)).toBe(true);
  });

  it("un-collapses a minimized canvas for the capture and re-collapses it after", async () => {
    const el = canvas({ collapsed: true });
    const before = el.outerHTML;
    let duringCapture = "";
    mockToBlob.mockImplementationOnce((node: HTMLElement) => {
      duringCapture = node.className;
      return Promise.resolve(new Blob(["png"]));
    });

    await exportCanvas(el);

    expect(duringCapture).not.toContain("vizardry-canvas--minimized");
    expect(duringCapture).toContain("vizardry-capturing");
    expect(el.outerHTML).toBe(before);
  });

  it("forces the light palette during the capture and restores the vault's theme", async () => {
    const el = canvas();
    el.classList.add("theme-dark");
    const before = el.getAttribute("class");
    let during = "";
    mockToBlob.mockImplementationOnce((node: HTMLElement) => {
      during = node.className;
      return Promise.resolve(new Blob(["png"]));
    });

    await exportCanvas(el, { light: true });

    expect(during).toContain("theme-light");
    expect(during).not.toContain("theme-dark");
    expect(el.getAttribute("class")).toBe(before);
  });

  it("leaves the theme alone when light is off (the download button's path)", async () => {
    const el = canvas();
    el.classList.add("theme-dark");
    let during = "";
    mockToBlob.mockImplementationOnce((node: HTMLElement) => {
      during = node.className;
      return Promise.resolve(new Blob(["png"]));
    });

    await exportCanvas(el, { light: false });

    expect(during).toContain("theme-dark");
    expect(during).not.toContain("theme-light");
    expect(mockBestTextColor).not.toHaveBeenCalled();
  });
});

describe("contrast-checked colours", () => {
  it("re-resolves them only after the light class is on the root", async () => {
    const el = canvas();
    el.classList.add("theme-dark");
    const cell = el.createEl("div", { cls: "vzd-roadmap-col-header" });
    cell.setAttribute(AUTO_TEXT_ATTR, "");
    cell.style.color = "rgb(255, 255, 255)";
    let during = "";
    mockToBlob.mockImplementationOnce(() => {
      during = cell.style.color;
      return Promise.resolve(new Blob(["png"]));
    });

    await exportCanvas(el, { light: true });

    // Re-resolved for the capture...
    expect(during).toBe("#111111");
    // ...against the *light* background, never the theme it was rendered in.
    expect(bestTextColorCalls).toEqual([{ rootHadLight: true }]);
    // ...and the live canvas keeps what it rendered with.
    expect(cell.style.color).toBe("rgb(255, 255, 255)");
  });
});

describe("SVG paint", () => {
  // html-to-image deep-clones an <svg> and styles only the node it cloned, never
  // its descendants — and the clone is serialized into a document this plugin's
  // stylesheet doesn't reach. Without the inline pass, every SVG child falls back
  // to SVG's initial values, which is how an exported Wardley map arrived with
  // solid black evolution bands.
  function svgCanvas(): { root: HTMLElement; band: SVGElement } {
    document.head.innerHTML = `<style>.band { fill: rgb(234, 234, 234); opacity: 0.5; }</style>`;
    const root = canvas();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    band.setAttribute("class", "band");
    svg.appendChild(band);
    root.appendChild(svg);
    return { root, band };
  }

  it("carries a class-styled fill into the capture as an inline style", async () => {
    const { root, band } = svgCanvas();
    let during: string | null = null;
    mockToBlob.mockImplementationOnce(() => {
      during = band.getAttribute("style");
      return Promise.resolve(new Blob(["png"]));
    });

    await exportCanvas(root);

    expect(during).toContain("fill: rgb(234, 234, 234)");
    expect(during).toContain("opacity: 0.5");
  });

  it("leaves the live canvas exactly as it found it", async () => {
    const { root, band } = svgCanvas();
    band.setAttribute("style", "stroke: red");
    const before = root.outerHTML;

    await exportCanvas(root);

    expect(band.getAttribute("style")).toBe("stroke: red");
    expect(root.outerHTML).toBe(before);
  });

  it("restores the SVG even when the capture throws", async () => {
    const { root, band } = svgCanvas();
    const before = root.outerHTML;
    mockToBlob.mockRejectedValueOnce(new Error("boom"));

    await expect(exportCanvas(root)).rejects.toMatchObject({ code: "capture-failed" });

    expect(band.getAttribute("style")).toBeNull();
    expect(root.outerHTML).toBe(before);
  });
});

describe("concurrency", () => {
  it("serialises captures instead of interleaving their restores", async () => {
    const first = canvas({ title: "First" });
    const second = canvas({ title: "Second" });
    const order: string[] = [];
    let releaseFirst = (): void => {};

    mockToBlob.mockImplementationOnce(async () => {
      order.push("first:enter");
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push("first:exit");
      return new Blob(["png"]);
    });
    mockToBlob.mockImplementationOnce(async () => {
      order.push("second:enter");
      return new Blob(["png"]);
    });

    const a = exportCanvas(first);
    const b = exportCanvas(second);
    await vi.waitFor(() => expect(order).toContain("first:enter"));
    expect(order).not.toContain("second:enter");

    releaseFirst();
    await Promise.all([a, b]);
    expect(order).toEqual(["first:enter", "first:exit", "second:enter"]);
  });

  it("does not let a failed capture block the queue behind it", async () => {
    const el = canvas();
    mockToBlob.mockRejectedValueOnce(new Error("boom"));
    await expect(exportCanvas(el)).rejects.toMatchObject({ code: "capture-failed" });
    await expect(exportCanvas(el)).resolves.toMatchObject({ format: "png" });
  });
});

describe("one capture path", () => {
  // The acceptance criterion the contract settled on: not byte-identical PNGs
  // (the button's pixel ratio is device-derived and html-to-image is mocked
  // here), but *the same call* — if these two ever diverge, the button and the
  // API have grown separate capture paths again.
  it("the download button and exportCanvas issue the same capture for the same request", async () => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:mock");
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const el = document.createElement("div");
    document.body.appendChild(el);
    initCanvas(el, "wardley", "My Map", undefined, "source", undefined, undefined);
    sizeOf(el, 800, 600);

    el.querySelector<HTMLButtonElement>(".vizardry-download-btn")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());

    // The button keeps the vault's theme and its title row; everything else is
    // the same request, so the two option objects must agree.
    await exportCanvas(el, { light: false, scale: 2, background: "#ffffff", header: true });

    const fromButton = blobOptions(0);
    const fromApi = blobOptions(1);
    expect(fromApi.pixelRatio).toBe(fromButton.pixelRatio);
    expect(fromApi.backgroundColor).toBe(fromButton.backgroundColor);
    expect(fromApi.width).toBe(fromButton.width);
    expect(fromApi.height).toBe(fromButton.height);

    // Including the filter: same verdict on chrome and on content.
    const actions = el.querySelector<HTMLElement>(".vizardry-header-actions")!;
    const header = el.querySelector<HTMLElement>(".vizardry-header")!;
    const buttonFilter = fromButton.filter as (n: Node) => boolean;
    const apiFilter = fromApi.filter as (n: Node) => boolean;
    for (const node of [actions, header, el]) {
      expect(apiFilter(node)).toBe(buttonFilter(node));
    }

    clickSpy.mockRestore();
  });
});
