// @vitest-environment happy-dom
/**
 * Tests for story-edit.ts — the surgical source mutations driving the
 * User Story Map canvas (add/delete/rename tasks, steps, activities;
 * move tasks between slices and columns).
 *
 * All tests use a mock editor backed by a simple string array so they run
 * without Obsidian's runtime. The MarkdownView mock is declared via vi.mock
 * so that `instanceof MarkdownView` checks resolve against the same class.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
  Notice: class MockNotice {
    constructor(public message: string, public timeout?: number) {}
  },
}));

import {
  addStoryTask,
  deleteStoryTask,
  renameStoryActivity,
  renameStoryStep,
  renameStoryTask,
  moveStoryTaskSlice,
  reorderStoryTask,
  moveStoryTaskCrossColumn,
} from "./story-edit";
import { MarkdownView } from "obsidian";

// ── Mock helpers ────────────────────────────────────────────────────────────

function makeMockEditor(lines: string[]) {
  const state = [...lines];
  const replaceRange = vi.fn((text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
    if (to === undefined) {
      // Insert: splice text after `from`
      const line = state[from.line] ?? "";
      state[from.line] = line.slice(0, from.ch) + text;
    } else if (text === "" && to.ch === 0) {
      // Delete whole line
      state.splice(from.line, 1);
    } else {
      // Replace range within a single line
      const line = state[from.line] ?? "";
      state[from.line] = line.slice(0, from.ch) + text + line.slice(to.ch);
    }
  });
  return {
    getLine: (n: number) => state[n] ?? "",
    lineCount: () => state.length,
    replaceRange,
    _state: state,
  };
}

type MockEditor = ReturnType<typeof makeMockEditor>;

function makeApp(sourcePath: string, editor: MockEditor | null) {
  const view = Object.create((MarkdownView as any).prototype) as any;
  view.file = { path: sourcePath };
  view.editor = editor;
  return {
    vault: { getFileByPath: (p: string) => (p === sourcePath ? { path: p } : null) },
    workspace: { getLeavesOfType: () => (editor ? [{ view }] : []) },
  };
}

function makeCtx(sourcePath: string, lineStart: number, lineEnd: number) {
  return {
    sourcePath,
    getSectionInfo: (_el: HTMLElement) => ({ lineStart, lineEnd, text: "" }),
  };
}

const PATH = "map.md";
const el = document.createElement("div");

/**
 * Canonical USM source used across most tests:
 *
 *  0: ```story-map
 *  1: title: My Map
 *  2:
 *  3: activity: Discover
 *  4:   step: Search
 *  5:     task: Find Item
 *  6:     task: Browse Catalog
 *  7:   step: Review
 *  8:     task: Compare Prices
 *  9: activity: Purchase
 * 10:   step: Checkout
 * 11:     task: Add to Cart
 * 12:     task: Pay
 * 13:
 * 14: slice: MVP
 * 15:   step: Search | find item, browse catalog
 * 16:   step: Checkout | add to cart
 * 17:
 * 18: slice: V2
 * 19:   step: Review | compare prices
 * 20:   step: Checkout | pay
 * 21: ```
 */
function makeSource(): string[] {
  return [
    "```story-map",
    "title: My Map",
    "",
    "activity: Discover",
    "  step: Search",
    "    task: Find Item",
    "    task: Browse Catalog",
    "  step: Review",
    "    task: Compare Prices",
    "activity: Purchase",
    "  step: Checkout",
    "    task: Add to Cart",
    "    task: Pay",
    "",
    "slice: MVP",
    "  step: Search | find item, browse catalog",
    "  step: Checkout | add to cart",
    "",
    "slice: V2",
    "  step: Review | compare prices",
    "  step: Checkout | pay",
    "```",
  ];
}

// ── addStoryTask ────────────────────────────────────────────────────────────

describe("addStoryTask", () => {
  it("appends a task after the last task in the target step", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = addStoryTask(app, ctx, el, "Search", "New Task");
    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [text] = editor.replaceRange.mock.calls[0];
    expect(text).toContain("task: New Task");
  });

  it("inserts directly after the step: line when the step has no tasks", () => {
    const lines = [
      "```story-map",
      "activity: Discover",
      "  step: Search",
      "  step: Review",
      "    task: Compare Prices",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 5) as any;

    addStoryTask(app, ctx, el, "Search", "New Task");
    const [text, from] = editor.replaceRange.mock.calls[0];
    expect(text).toContain("task: New Task");
    expect(from.line).toBe(2); // inserted after "step: Search"
  });

  it("deduplicates: appends \" 2\" when the task name already exists", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    addStoryTask(app, ctx, el, "Search", "Find Item");
    const [text] = editor.replaceRange.mock.calls[0];
    expect(text).toContain("task: Find Item 2");
  });

  it("returns false and shows a Notice when step not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = addStoryTask(app, ctx, el, "NonExistent", "Task");
    expect(ok).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("returns false when no editor is available", () => {
    const app = makeApp(PATH, null) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;
    expect(addStoryTask(app, ctx, el, "Search", "Task")).toBe(false);
  });
});

// ── deleteStoryTask ─────────────────────────────────────────────────────────

describe("deleteStoryTask", () => {
  it("removes the task declaration line", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = deleteStoryTask(app, ctx, el, "Find Item");
    expect(ok).toBe(true);
    const deleteCalls = editor.replaceRange.mock.calls.filter(
      ([t, f, to]) => t === "" && to?.ch === 0
    );
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("removes the task key from slice cells", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    deleteStoryTask(app, ctx, el, "Find Item");
    // The MVP slice step: Search line should now reference only browse catalog
    const replaceCalls = editor.replaceRange.mock.calls.filter(
      ([t]) => typeof t === "string" && t.includes("step: Search")
    );
    expect(replaceCalls.length).toBe(1);
    expect(replaceCalls[0][0]).not.toContain("find item");
    expect(replaceCalls[0][0]).toContain("browse catalog");
  });

  it("removes the step: line entirely when task was the only key in a cell", () => {
    const lines = [
      "```story-map",
      "activity: Discover",
      "  step: Search",
      "    task: Only Task",
      "",
      "slice: MVP",
      "  step: Search | only task",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 7) as any;

    deleteStoryTask(app, ctx, el, "Only Task");
    const sliceEdit = editor.replaceRange.mock.calls.find(
      ([t]) => typeof t === "string" && t.match(/step: Search\s*$/)
    );
    expect(sliceEdit).toBeDefined();
    expect(sliceEdit![0]).not.toContain("|");
  });

  it("returns false and shows a Notice when task not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(deleteStoryTask(app, ctx, el, "Ghost Task")).toBe(false);
  });
});

// ── renameStoryActivity ─────────────────────────────────────────────────────

describe("renameStoryActivity", () => {
  it("renames the activity: line in-place", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = renameStoryActivity(app, ctx, el, "Discover", "Explore");
    expect(ok).toBe(true);
    const [text] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("activity: Explore");
  });

  it("returns false when activity not found, shows Notice", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(renameStoryActivity(app, ctx, el, "Ghost", "New")).toBe(false);
  });

  it("returns false immediately when newName equals oldName", () => {
    const app = makeApp(PATH, makeMockEditor(makeSource())) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;
    expect(renameStoryActivity(app, ctx, el, "Discover", "Discover")).toBe(false);
  });

  it("returns false immediately when newName is blank", () => {
    const app = makeApp(PATH, makeMockEditor(makeSource())) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;
    expect(renameStoryActivity(app, ctx, el, "Discover", "   ")).toBe(false);
  });
});

// ── renameStoryStep ─────────────────────────────────────────────────────────

describe("renameStoryStep", () => {
  it("renames the step: declaration and all slice cell references", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = renameStoryStep(app, ctx, el, "Search", "Browse");
    expect(ok).toBe(true);
    // Should have edited the declaration + 2 slice cells (MVP and could be more)
    expect(editor.replaceRange.mock.calls.length).toBeGreaterThanOrEqual(2);
    const texts = editor.replaceRange.mock.calls.map(([t]) => t as string);
    expect(texts.some(t => t.includes("step: Browse") && !t.includes("|"))).toBe(true);
    expect(texts.some(t => t.includes("step: Browse") && t.includes("|"))).toBe(true);
  });

  it("returns false and shows Notice when step not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(renameStoryStep(app, ctx, el, "Ghost", "New")).toBe(false);
  });
});

// ── renameStoryTask ─────────────────────────────────────────────────────────

describe("renameStoryTask", () => {
  it("renames the task: declaration line", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = renameStoryTask(app, ctx, el, "Find Item", "Search Product");
    expect(ok).toBe(true);
    const texts = editor.replaceRange.mock.calls.map(([t]) => t as string);
    expect(texts.some(t => t.includes("task: Search Product"))).toBe(true);
  });

  it("updates slice cell references from old key to new key", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    renameStoryTask(app, ctx, el, "Find Item", "Search Product");
    const texts = editor.replaceRange.mock.calls.map(([t]) => t as string);
    const cellEdit = texts.find(t => t.includes("step: Search |"));
    expect(cellEdit).toBeDefined();
    expect(cellEdit).toContain("search product");
    expect(cellEdit).not.toContain("find item");
  });

  it("returns false and shows Notice when task not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(renameStoryTask(app, ctx, el, "Ghost", "New")).toBe(false);
  });

  it("returns false immediately when newName equals oldName", () => {
    const app = makeApp(PATH, makeMockEditor(makeSource())) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;
    expect(renameStoryTask(app, ctx, el, "Find Item", "Find Item")).toBe(false);
  });
});

// ── moveStoryTaskSlice ──────────────────────────────────────────────────────

describe("moveStoryTaskSlice", () => {
  it("is a no-op when fromSliceName === toSliceName", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(moveStoryTaskSlice(app, ctx, el, "Find Item", "Search", "MVP", "MVP")).toBe(true);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("removes task key from the fromSlice cell", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    moveStoryTaskSlice(app, ctx, el, "Find Item", "Search", "MVP", null);
    const texts = editor.replaceRange.mock.calls.map(([t]) => t as string);
    const mvpEdit = texts.find(t => t.includes("step: Search"));
    expect(mvpEdit).toBeDefined();
    expect(mvpEdit).not.toContain("find item");
    expect(mvpEdit).toContain("browse catalog");
  });

  it("adds task key to an existing toSlice cell", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    moveStoryTaskSlice(app, ctx, el, "Compare Prices", "Review", null, "MVP");
    const texts = editor.replaceRange.mock.calls.map(([t]) => t as string);
    // MVP had no Review cell — a new step: Review line should be inserted
    expect(texts.some(t => t.includes("step: Review") && t.includes("compare prices"))).toBe(true);
  });

  it("returns false and shows Notice when toSlice not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(moveStoryTaskSlice(app, ctx, el, "Find Item", "Search", "MVP", "Ghost Slice")).toBe(false);
  });
});

// ── reorderStoryTask ────────────────────────────────────────────────────────

describe("reorderStoryTask", () => {
  it("swaps two task keys in a slice cell", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = reorderStoryTask(app, ctx, el, "Search", "MVP", 0, 1);
    expect(ok).toBe(true);
    const [text] = editor.replaceRange.mock.calls[0];
    // Keys should now be in reversed order
    expect(text.indexOf("browse catalog")).toBeLessThan(text.indexOf("find item"));
  });

  it("is a no-op when fromIndex === toIndex", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(reorderStoryTask(app, ctx, el, "Search", "MVP", 0, 0)).toBe(true);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("is a no-op when sliceName is null", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(reorderStoryTask(app, ctx, el, "Search", null, 0, 1)).toBe(true);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});

// ── moveStoryTaskCrossColumn ────────────────────────────────────────────────

describe("moveStoryTaskCrossColumn", () => {
  it("is a no-op when fromStep === toStep", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(moveStoryTaskCrossColumn(app, ctx, el, "Find Item", "Search", "Search", null)).toBe(true);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("removes the task declaration from fromStep and inserts it into toStep", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    const ok = moveStoryTaskCrossColumn(app, ctx, el, "Find Item", "Search", "Checkout", null);
    expect(ok).toBe(true);
    // task: Find Item should now appear under Checkout (inserted after last task in Checkout)
    const insertCall = editor.replaceRange.mock.calls.find(
      ([t]) => typeof t === "string" && t.includes("task: Find Item")
    );
    expect(insertCall).toBeDefined();
    // deletion call
    const deleteCall = editor.replaceRange.mock.calls.find(
      ([t, , to]) => t === "" && to?.ch === 0
    );
    expect(deleteCall).toBeDefined();
  });

  it("updates slice cells: removes from old step key, adds to new step key in toSlice", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    moveStoryTaskCrossColumn(app, ctx, el, "Find Item", "Search", "Checkout", "MVP");
    const texts = editor.replaceRange.mock.calls.map(([t]) => t as string);
    // Search cell in MVP should lose find item
    const searchEdit = texts.find(t => t.includes("step: Search |"));
    expect(searchEdit).toBeDefined();
    expect(searchEdit).not.toContain("find item");
    // Checkout cell in MVP should gain find item
    const checkoutEdit = texts.find(t => t.includes("step: Checkout") && t.includes("find item"));
    expect(checkoutEdit).toBeDefined();
  });

  it("returns false and shows Notice when fromStep not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(moveStoryTaskCrossColumn(app, ctx, el, "Find Item", "Ghost", "Checkout", null)).toBe(false);
  });

  it("returns false and shows Notice when task not found in fromStep", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(moveStoryTaskCrossColumn(app, ctx, el, "Ghost Task", "Search", "Checkout", null)).toBe(false);
  });

  it("returns false and shows Notice when toStep not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 21) as any;

    expect(moveStoryTaskCrossColumn(app, ctx, el, "Find Item", "Search", "GhostStep", null)).toBe(false);
  });
});
