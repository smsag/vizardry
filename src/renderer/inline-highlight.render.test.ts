// @vitest-environment happy-dom
/**
 * ==highlight== (and the other inline formats) across canvases: HTML labels
 * render a <mark>, SVG labels draw the words without the markers, and no
 * canvas shows a literal `==`.
 */
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  MarkdownView: class MarkdownView {},
  Notice: vi.fn(),
  moment: { locale: () => "en" },
  Platform: { isMobile: false, isDesktop: true },
  Component: class Component { load() {} unload() {} },
  MarkdownRenderer: { render: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("html-to-image", () => ({
  toBlob: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
}));

import { dispatchVizardry } from "../vizardry-dispatch";
import * as T from "../templates";

function fakeApp(headings: string[] = []): any {
  return {
    vault: { getFileByPath: () => ({ path: "note.md" }) },
    metadataCache: {
      getFileCache: () => ({ headings: headings.map((heading) => ({ heading })) }),
      on: () => ({}),
    },
    workspace: {
      getActiveViewOfType: () => undefined,
      getLeavesOfType: () => [],
      openLinkText: () => {},
    },
  };
}

function render(template: string, edit: (body: string) => string, headings: string[] = []): HTMLElement {
  const body = template.replace(/^```vizardry\n/, "").replace(/```\n?$/, "");
  const el = document.createElement("div");
  document.body.appendChild(el);
  dispatchVizardry(edit(body), el, { sourcePath: "note.md", getSectionInfo: () => null } as any, fakeApp(headings));
  return el;
}

/** Every mark in `el` as [text, colour]. */
function marks(el: HTMLElement): Array<[string, string | undefined]> {
  return Array.from(el.querySelectorAll<HTMLElement>("mark.vzd-mark"))
    .map((m) => [m.textContent ?? "", m.dataset.highlight]);
}

function visibleText(el: HTMLElement): string {
  return el.textContent ?? "";
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("HTML canvases render <mark>", () => {
  it.each([
    ["roadmap item", T.ROADMAP_TEMPLATE, "Fix checkout bug"],
    ["matrix item", T.MATRIX_PAIN_TEMPLATE, "Stale search results"],
    ["journey action", T.JOURNEY_TEMPLATE, "Receives renewal-failed email"],
    ["story task", T.STORY_MAP_TEMPLATE, null],
    ["pro/contra argument", T.PRO_CONTRA_TEMPLATE, null],
    ["odyssey milestone", T.ODYSSEY_TEMPLATE, null],
    ["compass entry", T.COMPASS_TEMPLATE, "New users abandon setup halfway"],
    ["RACI cell", T.RACI_TEMPLATE, null],
    ["SIPOC cell", T.SIPOC_TEMPLATE, null],
    ["pace layers cell", T.PACE_LAYERS_TEMPLATE, null],
    ["problem flow card (foreignObject)", T.PROBLEM_TEMPLATE, "Manual transport"],
    ["node map box (foreignObject)", T.NODE_MAP_TEMPLATE, "Payment Gateway"],
  ])("%s", (_label, template, word) => {
    // With no explicit word, highlight the first indented value or item text.
    const target = word ?? firstLabel(template);
    const el = render(template, (b) => b.split(target).join(`==🔴${target}==`));
    expect(marks(el)).toContainEqual([target, "red"]);
    expect(visibleText(el)).not.toContain("==");
    expect(visibleText(el)).not.toContain("🔴");
  });

  it("renders a plain highlight without a colour", () => {
    const el = render(T.ROADMAP_TEMPLATE, (b) => b.replace("Fix checkout bug", "Fix ==checkout== bug"));
    expect(marks(el)).toContainEqual(["checkout", undefined]);
  });

  it("nests bold inside a highlight", () => {
    const el = render(T.ROADMAP_TEMPLATE, (b) => b.replace("Fix checkout bug", "==Fix **checkout** bug=="));
    const mark = el.querySelector("mark.vzd-mark");
    expect(mark?.querySelector("strong")?.textContent).toBe("checkout");
  });

  it("links a highlighted label to the plain heading of the same name", () => {
    const el = render(T.ROADMAP_TEMPLATE, (b) => b.replace("Fix checkout bug", "==Fix checkout bug=="), ["Fix checkout bug"]);
    expect(el.querySelector(".vzd-roadmap-card-link-btn")).not.toBeNull();
  });
});

describe("SVG canvases strip the markers", () => {
  it.each([
    ["mind map node", T.MIND_MAP_TEMPLATE, "Branch Two"],
    ["wardley component", T.WARDLEY_TEMPLATE, "Auth Service"],
    ["concept map node", T.CONCEPT_MAP_TEMPLATE, "Sunlight"],
    ["concept map edge label", T.CONCEPT_MAP_TEMPLATE, "occurs in"],
    ["node map link label", T.NODE_MAP_TEMPLATE, "places order"],
    ["fishbone cause", T.FISHBONE_TEMPLATE, null],
  ])("%s", (_label, template, word) => {
    const target = word ?? firstLabel(template);
    const el = render(template, (b) => b.split(target).join(`==🟢${target}==`));
    const svgText = Array.from(el.querySelectorAll("svg text")).map((t) => t.textContent).join("\n");
    expect(svgText).toContain(target);
    expect(svgText).not.toContain("==");
    expect(svgText).not.toContain("🟢");
  });
});

/** The text of the first indented content line or `item:`-style value in a template. */
function firstLabel(template: string): string {
  for (const line of template.split("\n").slice(2)) {
    const m = /^\s+(?:[a-z_]+:\s*)?([A-Za-z][^|[\]:]*?)\s*(?:\||\[|$)/.exec(line);
    if (m && m[1]!.length > 3) return m[1]!;
  }
  throw new Error("no label found");
}
