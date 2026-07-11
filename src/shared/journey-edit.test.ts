// @vitest-environment happy-dom
/**
 * Tests for journey-edit.ts — the surgical source mutations driving the
 * Customer Journey Map / Service Blueprint canvas (add/delete/rename cards,
 * rename phases, reorder/move cards, expand/collapse variant).
 *
 * Mock editor/app pattern copied from story-edit.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

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
  addJourneyCard,
  deleteJourneyCard,
  renameJourneyCard,
  renamePhase,
  reorderJourneyCard,
  moveJourneyCardCrossPhase,
  writeJourneyMeta,
  expandToBlueprint,
  collapseToJourney,
} from "./journey-edit";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  const state = [...lines];
  const replaceRange = vi.fn((text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
    if (to === undefined) {
      const line = state[from.line] ?? "";
      state[from.line] = line.slice(0, from.ch) + text;
    } else if (text === "" && to.ch === 0) {
      state.splice(from.line, 1);
    } else {
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

const PATH = "journey.md";
const el = document.createElement("div");

/**
 * Canonical journey source used across most tests:
 *
 *  0: ```vizardry
 *  1: type: journey
 *  2: persona: Alice
 *  3:
 *  4: phase: Awareness
 *  5:   action: See ad
 *  6:   painpoint: Confusing
 *  7:   action: Read blog
 *  8: phase: Consideration
 *  9:   action: Compare
 * 10: ```
 */
function makeSource(): string[] {
  return [
    "```vizardry",
    "type: journey",
    "persona: Alice",
    "",
    "phase: Awareness",
    "  action: See ad",
    "  painpoint: Confusing",
    "  action: Read blog",
    "phase: Consideration",
    "  action: Compare",
    "```",
  ];
}

// ── addJourneyCard ──────────────────────────────────────────────────────────

describe("addJourneyCard", () => {
  it("appends a card after the last existing card of that lane", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = addJourneyCard(app, ctx, el, "Awareness", "action", "New Action");
    expect(ok).toBe(true);
    const [text, from] = editor.replaceRange.mock.calls[0];
    expect(text).toContain("action: New Action");
    expect(from.line).toBe(7); // after "action: Read blog"
  });

  it("inserts after the phase line when the phase has no lane lines yet", () => {
    const lines = ["```vizardry", "type: journey", "phase: Empty", "phase: Other", "  action: X", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 5) as any;

    addJourneyCard(app, ctx, el, "Empty", "action", "First");
    const [text, from] = editor.replaceRange.mock.calls[0];
    expect(text).toContain("action: First");
    expect(from.line).toBe(2); // "phase: Empty" line
  });
});

// ── deleteJourneyCard ────────────────────────────────────────────────────────

describe("deleteJourneyCard", () => {
  it("deletes the Nth card of the named lane", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = deleteJourneyCard(app, ctx, el, "Awareness", "action", 1);
    expect(ok).toBe(true);
    expect(editor._state.some(l => l.includes("Read blog"))).toBe(false);
    expect(editor._state.some(l => l.includes("See ad"))).toBe(true);
  });
});

// ── renameJourneyCard ────────────────────────────────────────────────────────

describe("renameJourneyCard", () => {
  it("renames a card while preserving its subtitle", () => {
    const lines = ["```vizardry", "type: journey", "phase: A", "  feeling: Confused | a subtitle", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 4) as any;

    renameJourneyCard(app, ctx, el, "A", "feeling", 0, "Frustrated");
    expect(editor._state[3]).toContain("feeling: Frustrated | a subtitle");
  });
});

// ── renamePhase ──────────────────────────────────────────────────────────────

describe("renamePhase", () => {
  it("renames the phase declaration line", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = renamePhase(app, ctx, el, "Awareness", "Discovery");
    expect(ok).toBe(true);
    expect(editor._state[4]).toBe("phase: Discovery");
  });
});

// ── reorderJourneyCard ────────────────────────────────────────────────────────

describe("reorderJourneyCard", () => {
  it("swaps card content across non-contiguous lane lines", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    // Awareness's "action" lane has "See ad" (0) and "Read blog" (1), with a
    // painpoint line interleaved between them.
    const ok = reorderJourneyCard(app, ctx, el, "Awareness", "action", 0, 1);
    expect(ok).toBe(true);
    expect(editor._state[5]).toContain("action: Read blog");
    expect(editor._state[7]).toContain("action: See ad");
    expect(editor._state[6]).toContain("painpoint: Confusing"); // untouched
  });
});

// ── moveJourneyCardCrossPhase ─────────────────────────────────────────────────

describe("moveJourneyCardCrossPhase", () => {
  it("is a no-op when fromPhase === toPhase", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    expect(moveJourneyCardCrossPhase(app, ctx, el, 0, "Awareness", "Awareness", "action")).toBe(true);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("removes the card from the source phase and inserts it into the destination phase's lane", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = moveJourneyCardCrossPhase(app, ctx, el, 0, "Awareness", "Consideration", "action");
    expect(ok).toBe(true);

    const insertCall = editor.replaceRange.mock.calls.find(
      ([t]) => typeof t === "string" && t.includes("action: See ad")
    );
    expect(insertCall).toBeDefined();

    const deleteCall = editor.replaceRange.mock.calls.find(
      ([t, , to]) => t === "" && to?.ch === 0
    );
    expect(deleteCall).toBeDefined();
  });

  it("returns false and shows a Notice when the source phase is not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    expect(moveJourneyCardCrossPhase(app, ctx, el, 0, "Ghost", "Consideration", "action")).toBe(false);
  });

  it("returns false and shows a Notice when the destination phase is not found", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    expect(moveJourneyCardCrossPhase(app, ctx, el, 0, "Awareness", "Ghost", "action")).toBe(false);
  });
});

// ── writeJourneyMeta ───────────────────────────────────────────────────────────

describe("writeJourneyMeta", () => {
  it("replaces an existing persona line", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    writeJourneyMeta(app, ctx, el, "persona", "Bob");
    expect(editor._state[2]).toBe("persona: Bob");
  });

  it("inserts a new scenario line when none exists", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    writeJourneyMeta(app, ctx, el, "scenario", "Renewal recovery");
    const [text] = editor.replaceRange.mock.calls[0];
    expect(text).toContain("scenario: Renewal recovery");
  });
});

// ── expandToBlueprint / collapseToJourney ─────────────────────────────────────

describe("expandToBlueprint", () => {
  it("rewrites a bare type: journey line", () => {
    const editor = makeMockEditor(makeSource());
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = expandToBlueprint(app, ctx, el);
    expect(ok).toBe(true);
    expect(editor._state[1]).toBe("type: journey, blueprint");
  });

  it("no-ops when already blueprint", () => {
    const lines = makeSource();
    lines[1] = "type: journey, blueprint";
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = expandToBlueprint(app, ctx, el);
    expect(ok).toBe(false);
    expect(editor._state[1]).toBe("type: journey, blueprint");
  });
});

describe("collapseToJourney", () => {
  it("rewrites a type: journey, blueprint line back to journey", () => {
    const lines = makeSource();
    lines[1] = "type: journey, blueprint";
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 10) as any;

    const ok = collapseToJourney(app, ctx, el);
    expect(ok).toBe(true);
    expect(editor._state[1]).toBe("type: journey");
  });

  it("does not touch frontstage/backstage/support lines — they round-trip", () => {
    const lines = [
      "```vizardry",
      "type: journey, blueprint",
      "phase: A",
      "  action: Do thing",
      "  frontstage: Greet",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp(PATH, editor) as any;
    const ctx = makeCtx(PATH, 0, 5) as any;

    collapseToJourney(app, ctx, el);
    expect(editor._state.some(l => l.includes("frontstage: Greet"))).toBe(true);
  });
});
