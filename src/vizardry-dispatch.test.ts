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
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
}));

import { dispatchVizardry, extractType } from "./vizardry-dispatch";

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

  it("ignores a duplicate top-level type: line instead of surfacing a confusing parse error", () => {
    const el = container();
    dispatchVizardry("type: swot\ntype: bmc\nblock: Strengths\n  Fast team", el, fakeCtx(), fakeApp());
    // Renders using the first type: line ("swot"), not a "unexpected
    // syntax" error from the swot parser choking on the leftover
    // "type: bmc" line.
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
  });

  it("dispatches a flat grid id to renderCanvas", () => {
    const el = container();
    dispatchVizardry("type: swot\nblock: Strengths\n  Fast team", el, fakeCtx(), fakeApp());
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
    expect(el.classList.contains("vizardry-error")).toBe(false);
  });

  it("dispatches a compound-variant id (matrix) and applies the variant", () => {
    const el = container();
    dispatchVizardry("type: matrix, opportunity\nblock: very-major-1\n  X", el, fakeCtx(), fakeApp());
    expect(el.classList.contains("vizardry-error")).toBe(false);
    expect(el.querySelector(".vzd-matrix-wrap")?.getAttribute("data-type")).toBe("opportunity");
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
