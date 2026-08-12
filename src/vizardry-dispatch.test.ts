// @vitest-environment happy-dom

/**
 * Tests for the unified ```vizardry dispatcher — the `type:` line
 * extraction/splitting/blanking logic, and that dispatch reaches the right
 * parser/renderer for each of the four id categories (grid, flat custom,
 * compound-variant, flat-with-baked-default).
 *
 * Not exhaustive per-framework rendering coverage — that already exists in
 * src/renderer/renderer.test.ts and each framework's own parser tests.
 */

import "./test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock obsidian ─────────────────────────────────────────────────────────────
vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  MarkdownView: class MarkdownView {},
  Notice: vi.fn(),
  moment: { locale: () => "en" },
  Platform: { isMobile: false, isDesktop: true },
  Component: class Component { load() {} unload() {} },
  MarkdownRenderer: { render: vi.fn().mockResolvedValue(undefined) },
}));

// ── Mock html-to-image (lazy-imported inside controls.ts) ─────────────────────
vi.mock("html-to-image", () => ({
  toBlob: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
}));

import { dispatchVizardry, extractType, splitVizardryCanvases } from "./vizardry-dispatch";

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function fakeApp(): any {
  return {
    vault: { getFileByPath: () => null },
    metadataCache: { getFileCache: () => undefined, on: () => ({}) },
    workspace: {
      getActiveViewOfType: () => undefined,
      getLeavesOfType: () => [],
      openLinkText: () => {},
    },
  };
}

function fakeCtx(sourcePath = "note.md"): any {
  return { sourcePath, getSectionInfo: () => null };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

// ── extractType ──────────────────────────────────────────────────────────────

describe("extractType", () => {
  it("returns null when no top-level type: line exists", () => {
    expect(extractType("block: Goal\n  X")).toBeNull();
  });

  it("finds a flat type: value with no variant", () => {
    const found = extractType("type: bmc\nblock: Goal\n  X");
    expect(found?.id).toBe("bmc");
    expect(found?.variant).toBeUndefined();
  });

  it("splits a compound type: value on the first comma", () => {
    const found = extractType("type: matrix, pain\nblock: Goal\n  X");
    expect(found?.id).toBe("matrix");
    expect(found?.variant).toBe("pain");
  });

  it("trims and lowercases both id and variant", () => {
    const found = extractType("type:   Matrix ,  Pain  \nblock: Goal\n  X");
    expect(found?.id).toBe("matrix");
    expect(found?.variant).toBe("pain");
  });

  it("ignores an indented type:-looking line (only top-level counts)", () => {
    const found = extractType("block: Goal\n  type: not a real dispatch line");
    expect(found).toBeNull();
  });

  it("blanks the consumed line rather than removing it, preserving line count", () => {
    const source = "type: bmc\nblock: Goal\n  X";
    const found = extractType(source);
    const lines = found!.parseSource.split("\n");
    expect(lines).toHaveLength(source.split("\n").length);
    expect(lines[0]).toBe("");
    expect(lines[1]).toBe("block: Goal");
  });

  it("finds the first top-level type: line when more than one exists", () => {
    const found = extractType("type: bmc\ntype: swot\nblock: Goal\n  X");
    expect(found?.id).toBe("bmc");
  });
});

// ── dispatchVizardry ─────────────────────────────────────────────────────────

describe("dispatchVizardry", () => {
  it("shows an error banner when no type: line is present", () => {
    const el = container();
    dispatchVizardry("block: Goal\n  X", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(true);
    expect(el.querySelector(".vizardry-error-message")?.textContent).toContain('"type:"');
  });

  it("shows an error banner for an unknown type id", () => {
    const el = container();
    dispatchVizardry("type: nonsense\nblock: Goal\n  X", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(true);
    expect(el.querySelector(".vizardry-error-message")?.textContent).toContain('Unknown type "nonsense"');
  });

  it("dispatches a flat grid id to renderCanvas", () => {
    const el = container();
    dispatchVizardry("type: swot\nblock: Strengths\n  Fast team", el, fakeCtx(), fakeApp());
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
    expect(el.classList.contains("vizardry-error")).toBe(false);
  });

  it("renders a grid with a warning chip for a recoverable issue instead of erroring", () => {
    const el = container();
    // A stray unknown root line degrades to a warning; the grid still renders.
    dispatchVizardry("type: swot\nblock: Strengths\n  Fast team\noops: bad", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
    expect(el.querySelector(".vzd-canvas-warning-chip")).toBeTruthy();
  });

  it("dispatches a matrix preset variant and renders the unified engine", () => {
    const el = container();
    dispatchVizardry("type: matrix, opportunity\nitem: Idea at: t1", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelector(".vzd-mx-wrap")?.getAttribute("data-preset")).toBe("opportunity");
    expect(el.querySelector(".vzd-mx-item-label")?.textContent).toBe("Idea");
  });

  it("renders a preset-less matrix from author-defined axes", () => {
    const el = container();
    const src = [
      "type: matrix",
      "x: Effort | Low | High",
      "y: Reach | Narrow | Wide",
      "t1: Do first | very-high",
      "item: Fix checkout [0.2, 0.8]",
    ].join("\n");
    dispatchVizardry(src, el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelector(".vzd-mx-wrap")).toBeTruthy();
    expect(el.querySelectorAll(".vzd-mx-cell")).toHaveLength(4); // 2×2
  });

  it("scenario is now a matrix preset (2×2)", () => {
    const el = container();
    const src = [
      "type: matrix, scenario",
      "x: AI | Assistive | Autonomous",
      "y: Regulation | Light | Strict",
      "t1: Wild West",
      "item: Agents at: t1",
    ].join("\n");
    dispatchVizardry(src, el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelectorAll(".vzd-mx-cell")).toHaveLength(4);
    expect(el.querySelector(".vzd-mx-cell-name")?.textContent).toBe("Wild West");
  });

  it("dispatches a compound-variant id (pacelayers) and applies the variant", () => {
    const el = container();
    dispatchVizardry("type: pacelayers, product\nlayer: Fashion\n  note: X", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    // "Fashion" renders as "Experiments" under the product variant.
    expect(el.querySelector(".vzd-pl-layer-name")?.textContent).toBe("Experiments");
  });

  it("dispatches a flat custom id with no variant (conceptmap)", () => {
    const el = container();
    dispatchVizardry("type: conceptmap\nA --> B", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelector(".vzd-cmap-wrap")).toBeTruthy();
  });

  it("dispatches the flat scqa/scr ids to their own baked-in variant", () => {
    const elScqa = container();
    dispatchVizardry("type: scqa\nsituation: Root", elScqa, fakeCtx(), fakeApp());
    expect(elScqa.getAttribute("data-framework")).toBe("scqa");

    const elScr = container();
    dispatchVizardry("type: scr\nsituation: Root", elScr, fakeCtx(), fakeApp());
    expect(elScr.getAttribute("data-framework")).toBe("scr");
  });

  it("dispatches sipoc's table/flow compound variant to its shared parser+renderer", () => {
    const elTable = container();
    dispatchVizardry(
      "type: sipoc\nrow:\n  supplier: A\n  customer: B",
      elTable, fakeCtx(), fakeApp(),
    );
    expect(elTable.classList.contains("vizardry-error")).toBe(false);

    const elFlow = container();
    dispatchVizardry(
      "type: sipoc, flow\nrow:\n  supplier: A\n  customer: B\nlink: A -> B",
      elFlow, fakeCtx(), fakeApp(),
    );
    expect(elFlow.classList.contains("vizardry-error")).toBe(false);
  });

  it("rejects the old flat sipoc-flow id (dropped in favour of type: sipoc, flow)", () => {
    const el = container();
    dispatchVizardry(
      "type: sipoc-flow\nrow:\n  supplier: A\n  customer: B",
      el, fakeCtx(), fakeApp(),
    );
    expect(el.classList.contains("vizardry-error")).toBe(true);
  });
});

// ── splitVizardryCanvases ─────────────────────────────────────────────────────

describe("splitVizardryCanvases", () => {
  it("returns the source unchanged for a single type: line", () => {
    const src = "type: swot\nblock: Strengths\n  Fast team";
    expect(splitVizardryCanvases(src)).toEqual([src]);
  });

  it("returns the source unchanged when there is no type: line", () => {
    const src = "block: Goal\n  X";
    expect(splitVizardryCanvases(src)).toEqual([src]);
  });

  it("splits at each top-level type: line", () => {
    const segs = splitVizardryCanvases("type: swot\nblock: S\ntype: bmc\nblock: K");
    expect(segs).toEqual(["type: swot\nblock: S", "type: bmc\nblock: K"]);
  });

  it("attaches preamble before the first type: to the first canvas", () => {
    const segs = splitVizardryCanvases("\ntitle: Deck\ntype: swot\nblock: S\ntype: bmc\nblock: K");
    expect(segs[0]).toBe("\ntitle: Deck\ntype: swot\nblock: S");
    expect(segs[1]).toBe("type: bmc\nblock: K");
  });

  it("does not treat an indented type:-looking line as a boundary", () => {
    const segs = splitVizardryCanvases("type: swot\nblock: S\n  type: not a boundary");
    expect(segs).toHaveLength(1);
  });

  it("gives each segment exactly one top-level type: line (feeds extractType cleanly)", () => {
    const segs = splitVizardryCanvases("type: swot\nx\ntype: bmc\ny\ntype: matrix\nz");
    expect(segs).toHaveLength(3);
    for (const seg of segs) {
      const topLevelTypes = seg.split("\n").filter(l => l.search(/\S/) === 0 && l.trim().toLowerCase().startsWith("type:"));
      expect(topLevelTypes).toHaveLength(1);
    }
  });
});

// ── dispatchVizardry: multi-canvas carousel ──────────────────────────────────

describe("dispatchVizardry — multi-canvas carousel", () => {
  const twoCanvas = [
    "type: swot",
    "block: Strengths",
    "  Fast team",
    "type: bmc",
    "block: Key Partners",
    "  Suppliers",
  ].join("\n");

  it("renders a carousel with one panel per canvas when several type: lines exist", () => {
    const el = container();
    dispatchVizardry(twoCanvas, el, fakeCtx(), fakeApp());
    expect(el.querySelector(".vzd-multi")).toBeTruthy();
    expect(el.querySelectorAll(".vzd-multi-panel")).toHaveLength(2);
    // Each panel rendered its own grid canvas.
    expect(el.querySelectorAll(".vzd-multi-panel .vizardry-grid")).toHaveLength(2);
  });

  it("shows only the first panel and provides nav (prev/next + a dot per panel)", () => {
    const el = container();
    dispatchVizardry(twoCanvas, el, fakeCtx(), fakeApp());
    const panels = el.querySelectorAll(".vzd-multi-panel");
    expect(panels[0].classList.contains("is-active")).toBe(true);
    expect(panels[1].classList.contains("is-active")).toBe(false);
    expect(el.querySelector(".vzd-multi-nav")).toBeTruthy();
    expect(el.querySelectorAll(".vzd-multi-nav .vizardry-nav-dot")).toHaveLength(2);
    expect(el.querySelectorAll(".vzd-multi-nav .vizardry-nav-btn")).toHaveLength(2);
  });

  it("advances to the next panel when the next button is clicked", () => {
    const el = container();
    dispatchVizardry(twoCanvas, el, fakeCtx(), fakeApp());
    const [prev, next] = Array.from(el.querySelectorAll<HTMLButtonElement>(".vzd-multi-nav .vizardry-nav-btn"));
    expect(prev.disabled).toBe(true); // at the first panel
    next.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const panels = el.querySelectorAll(".vzd-multi-panel");
    expect(panels[0].classList.contains("is-active")).toBe(false);
    expect(panels[1].classList.contains("is-active")).toBe(true);
    expect(next.disabled).toBe(true); // now at the last panel
  });

  it("renders a single canvas (no carousel) for a lone type: line", () => {
    const el = container();
    dispatchVizardry("type: swot\nblock: Strengths\n  Fast team", el, fakeCtx(), fakeApp());
    expect(el.querySelector(".vzd-multi")).toBeNull();
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
  });

  it("renders carousel panels read-only even though the view reports edit mode", () => {
    // fakeApp's getActiveViewOfType returns undefined, so isEditModeActive is
    // true for a lone canvas — but inside the carousel renderReadOnly forces
    // read-only, so the Problem canvas wires no in-place edit affordances.
    const el = container();
    const src = [
      "type: problem, business",
      "vision: Fast",
      "type: problem, business",
      "issue: Slow",
    ].join("\n");
    dispatchVizardry(src, el, fakeCtx(), fakeApp());
    expect(el.querySelectorAll(".vzd-multi-panel")).toHaveLength(2);
    expect(el.querySelectorAll(".vzd-flow-editable")).toHaveLength(0);
    expect(el.querySelectorAll(".vzd-flow-add")).toHaveLength(0);
  });
});
