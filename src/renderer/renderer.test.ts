// @vitest-environment happy-dom

/**
 * Renderer smoke tests — verify that every renderer produces the expected DOM
 * structure, does not throw, and handles error paths gracefully.
 *
 * Not visual fidelity tests. Goal: catch crashes, missing elements, and broken
 * error paths before they reach Obsidian.
 *
 * Setup: happy-dom provides browser DOM APIs; test-setup.ts polyfills Obsidian's
 * HTMLElement extensions (createEl, addClass, etc.) and stubs matchMedia/rAF.
 */

import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock obsidian ─────────────────────────────────────────────────────────────
vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
  MarkdownView: class MarkdownView {},
  moment: { locale: () => "en" },
  Platform: { isMobile: false, isDesktop: true },
  Component: class Component { load() {} unload() {} },
  MarkdownRenderer: { render: vi.fn().mockResolvedValue(undefined) },
}));

// ── Mock html-to-image (lazy-imported inside controls.ts) ─────────────────────
vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,abc"),
}));

// ── Renderer imports (after mocks are declared) ───────────────────────────────
import { renderError, renderCanvas } from "./canvas";
import { renderTree, OST_TREE_OPTIONS, MINDMAP_OPTS, IMPACT_MAP_OPTS } from "./tree";
import { renderMindMap, renderImpactMap, renderOST } from "./tree-canvases";
import { renderStoryMap } from "./story";
import { renderWardleyMap } from "./wardley";
import { renderSIPOC } from "./sipoc";
import { renderVennDiagram } from "./venn";
import { renderCarouselBlock } from "./carousel";
import { renderConceptMap } from "./conceptmap";
import { renderSCQA } from "./scqa";
import { NULL_RESOLVER } from "../shared/links";
import * as wardleyEdit from "../shared/wardley-edit";

import type {
  FrameworkDefinition,
  TreeNode,
  OSTTree,
  MindMap,
  ImpactMap,
  StoryMap,
  WardleyMap,
  SIPOCData,
  VennDiagram,
  CarouselBlock,
  ConceptMap,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

// ── renderError ───────────────────────────────────────────────────────────────

describe("renderError", () => {
  it("renders error icon and message", () => {
    const el = container();
    renderError("something went wrong", el);
    expect(el.classList.contains("vizardry-error")).toBe(true);
    expect(el.querySelector(".vizardry-error-message")?.textContent).toBe("something went wrong");
    expect(el.querySelector(".vizardry-error-icon")).toBeTruthy();
  });
});

// ── renderCanvas (grid frameworks) ───────────────────────────────────────────

describe("renderCanvas", () => {
  const swot: FrameworkDefinition = {
    id: "swot",
    label: "SWOT Analysis",
    gridTemplate: '"st wk"\n"op th"',
    gridColumns: "1fr 1fr",
    gridRows: "1fr 1fr",
    blocks: [
      { label: "Strengths", area: "st" },
      { label: "Weaknesses", area: "wk" },
      { label: "Opportunities", area: "op" },
      { label: "Threats", area: "th" },
    ],
  };

  it("renders header and all blocks", () => {
    const el = container();
    renderCanvas(swot, { strengths: "Fast team", weaknesses: "" }, new Set(), el, NULL_RESOLVER, vi.fn());
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
    const blocks = el.querySelectorAll(".vizardry-block");
    expect(blocks).toHaveLength(4);
  });

  it("renders block content as lines", () => {
    const el = container();
    renderCanvas(swot, { strengths: "Line one\nLine two" }, new Set(), el, NULL_RESOLVER, vi.fn());
    const lines = el.querySelectorAll(".vzd-block-line");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toBe("Line one");
  });

  it("marks empty block with empty class", () => {
    const el = container();
    renderCanvas(swot, {}, new Set(), el, NULL_RESOLVER, vi.fn());
    const bodies = el.querySelectorAll(".vizardry-block-empty");
    expect(bodies.length).toBeGreaterThan(0);
  });

  it("renders link button when _links entry exists", () => {
    const el = container();
    renderCanvas(swot, {}, new Set(), el, { resolve: (k: string) => k === "strengths" ? "Strategy Section" : undefined }, vi.fn());
    expect(el.querySelector(".vizardry-block-link-btn")).toBeTruthy();
  });

  it("link button calls navigateTo with the heading", () => {
    const el = container();
    const navigateTo = vi.fn();
    renderCanvas(swot, {}, new Set(), el, { resolve: (k: string) => k === "strengths" ? "My Heading" : undefined }, navigateTo);
    const btn = el.querySelector<HTMLButtonElement>(".vizardry-block-link-btn");
    btn?.click();
    expect(navigateTo).toHaveBeenCalledWith("My Heading");
  });

  it("allCards forces every block to render as a card, ignoring per-block modifiers", () => {
    const el = container();
    renderCanvas(swot, { strengths: "Fast team" }, new Set(), el, NULL_RESOLVER, vi.fn(), undefined, undefined, undefined, true);
    expect(el.querySelectorAll(".vzd-block-line")).toHaveLength(0);
    expect(el.querySelector(".vzd-card-block-card")).toBeTruthy();
  });

  it("renders multiple card blocks side by side without cards leaking between them", () => {
    const el = container();
    renderCanvas(
      swot,
      { strengths: "S1\nS2", weaknesses: "W1" },
      new Set(["strengths", "weaknesses"]),
      el, NULL_RESOLVER, vi.fn(),
    );
    const bodies = el.querySelectorAll(".vizardry-block-body");
    expect(bodies[0].querySelectorAll(".vzd-card-block-card")).toHaveLength(2);
    expect(bodies[0].textContent).toContain("S1");
    expect(bodies[1].querySelectorAll(".vzd-card-block-card")).toHaveLength(1);
    expect(bodies[1].textContent).toContain("W1");
    expect(bodies[1].textContent).not.toContain("S1");
  });

  it("a single card block renders the same as before this block had no cross-block siblings", () => {
    const el = container();
    renderCanvas(swot, { strengths: "Only card here" }, new Set(["strengths"]), el, NULL_RESOLVER, vi.fn());
    const cards = el.querySelectorAll(".vzd-card-block-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Only card here");
  });

  it("an empty card-mode block still gets the card-body layout class in edit mode", () => {
    const el = container();
    const app = { workspace: { getActiveViewOfType: () => ({ getMode: () => "source" }) } } as any;
    const ctx = { sourcePath: "note.md" } as any;
    renderCanvas(swot, { strengths: "" }, new Set(["strengths"]), el, NULL_RESOLVER, vi.fn(), app, ctx);
    const body = el.querySelector(".vizardry-block-empty");
    expect(body?.classList.contains("vzd-card-block-body")).toBe(true);
  });
});

// ── renderTree (shared SVG tree renderer) ─────────────────────────────────────

describe("renderTree", () => {
  function makeNode(text: string, level: number, children: TreeNode[] = []): TreeNode {
    return { text, level, children, x: 0, y: 0, width: 0, height: 0 };
  }

  it("renders an SVG with nodes for a flat tree", () => {
    const el = container();
    const root = makeNode("Root", 0, [makeNode("Child A", 1), makeNode("Child B", 1)]);
    renderTree({ root }, OST_TREE_OPTIONS, el);
    expect(el.querySelector("svg")).toBeTruthy();
    const texts = el.querySelectorAll("text");
    const labels = Array.from(texts).map(t => t.textContent);
    expect(labels).toContain("Root");
    expect(labels).toContain("Child A");
  });

  it("renders a deeper tree without throwing", () => {
    const el = container();
    const leaf = makeNode("Leaf", 3);
    const root = makeNode("Root", 0, [
      makeNode("L1", 1, [makeNode("L2", 2, [leaf])]),
    ]);
    expect(() => renderTree({ root }, IMPACT_MAP_OPTS, el)).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });

  it("truncates long labels to maxLabelChars", () => {
    const el = container();
    const longText = "A".repeat(40);
    renderTree({ root: makeNode(longText, 0) }, MINDMAP_OPTS, el);
    const mainText = el.querySelector(".vzd-tree-text-main");
    expect(mainText?.textContent?.length).toBeLessThanOrEqual(MINDMAP_OPTS.maxLabelChars);
  });
});

// ── renderOST ─────────────────────────────────────────────────────────────────

describe("renderOST", () => {
  it("renders OST without throwing", () => {
    const el = container();
    const tree: OSTTree = {
      root: {
        text: "Outcome", level: 0,
        children: [{ text: "Opportunity", level: 1, children: [] }],
      },
    };
    expect(() => renderOST(tree, el)).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });
});

// ── renderSCQA ────────────────────────────────────────────────────────────────

describe("renderSCQA", () => {
  const data = {
    variant: "scqa" as const,
    view: "grid" as const,
    root: {
      text: "Situation", level: 0,
      children: [
        { text: "Complication", level: 1, children: [
          { text: "Question", level: 2, children: [
            { text: "Answer", level: 3, children: [] },
          ] },
        ] },
      ],
    },
  };

  it("renders the grid view without throwing", () => {
    const el = container();
    expect(() => renderSCQA(data, el)).not.toThrow();
    expect(el.querySelector(".vzd-scqa-grid")).toBeTruthy();
    expect(el.querySelectorAll(".vzd-scqa-card").length).toBe(4);
  });

  it("renders the tree view without throwing", () => {
    const el = container();
    expect(() => renderSCQA({ ...data, view: "tree" }, el)).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });

  it("renders a heading-link affordance on a card whose text resolves", () => {
    const el = container();
    const resolver = { resolve: (label: string) => (label === "Complication" ? "My Heading" : undefined) };
    renderSCQA(data, el, resolver, () => {});
    const links = el.querySelectorAll(".vzd-card-link-btn");
    expect(links.length).toBe(1);
    expect((links[0] as HTMLElement).dataset.heading).toBe("My Heading");
  });

  it("renders the SCR variant through the same grid/card classes as SCQA", () => {
    // SCR has no variant-specific grid CSS, so this is what makes the row
    // height-equalization (.vzd-scqa-grid's align-items: stretch) apply to
    // SCR too — if SCR ever grew its own grid container class, it would
    // silently stop inheriting that rule.
    const scrData = {
      variant: "scr" as const,
      view: "grid" as const,
      root: {
        text: "Situation", level: 0,
        children: [
          { text: "Complication", level: 1, children: [
            { text: "Resolution", level: 2, children: [] },
          ] },
        ],
      },
    };
    const el = container();
    renderSCQA(scrData, el);
    expect(el.querySelector(".vzd-scqa-grid")).toBeTruthy();
    expect(el.querySelectorAll(".vzd-scqa-card").length).toBe(3);
  });
});

// ── renderMindMap ─────────────────────────────────────────────────────────────

describe("renderMindMap", () => {
  it("renders a mind map without throwing", () => {
    const el = container();
    const map: MindMap = {
      root: {
        text: "Central Idea",
        children: [
          { text: "Branch A", children: [] },
          { text: "Branch B", children: [{ text: "Leaf", children: [] }] },
        ],
      },
    };
    expect(() => renderMindMap(map, el)).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });
});

// ── renderImpactMap ───────────────────────────────────────────────────────────

describe("renderImpactMap", () => {
  it("renders an impact map without throwing", () => {
    const el = container();
    const map: ImpactMap = {
      goal: "Increase retention",
      actors: [
        {
          name: "User",
          impacts: [{ name: "Adopts feature", deliverables: ["Onboarding flow"] }],
        },
      ],
    };
    expect(() => renderImpactMap(map, el)).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });
});

// ── renderStoryMap ────────────────────────────────────────────────────────────

describe("renderStoryMap", () => {
  const minimalMap: StoryMap = {
    user: "Developer",
    goal: "Ship features",
    activities: [
      {
        name: "Build",
        steps: [
          {
            name: "Code",
            tasks: [
              { name: "Write tests", subtitle: "" },
              { name: "Open PR", subtitle: "link to ticket" },
            ],
          },
        ],
      },
    ],
    slices: [
      { name: "MVP", cells: { code: ["write tests"] } },
    ],
  };

  it("renders story grid without throwing", () => {
    const el = container();
    expect(() => renderStoryMap(minimalMap, el)).not.toThrow();
    expect(el.querySelector(".vzd-story-grid")).toBeTruthy();
  });

  it("renders activity and step headers", () => {
    const el = container();
    renderStoryMap(minimalMap, el);
    expect(el.querySelector(".vzd-story-activity-header")?.textContent).toBe("Build");
    expect(el.querySelector(".vzd-story-step-header")?.textContent).toBe("Code");
  });

  it("renders assigned task cards in slice", () => {
    const el = container();
    renderStoryMap(minimalMap, el);
    const cards = el.querySelectorAll(".vzd-story-task-card");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("renders backlog band for unassigned tasks", () => {
    const el = container();
    renderStoryMap(minimalMap, el);
    expect(el.querySelector(".vzd-story-backlog-band")).toBeTruthy();
  });

  it("renders meta header when user and goal are present", () => {
    const el = container();
    renderStoryMap(minimalMap, el);
    expect(el.querySelector(".vzd-story-meta")).toBeTruthy();
  });
});

// ── renderWardleyMap ──────────────────────────────────────────────────────────

describe("renderWardleyMap", () => {
  const map: WardleyMap = {
    anchor: "User", explicitComponents: new Set(["Auth", "Database"]),
    components: [
      { name: "User", visibility: 1.0, evolution: 0.8 },
      { name: "Auth", visibility: 0.6, evolution: 0.4 },
      { name: "Database", visibility: 0.2, evolution: 0.3 },
    ],
    links: [
      { from: "User", to: "Auth" },
      { from: "Auth", to: "Database" },
    ],
  };

  it("renders SVG with evolution stage labels", () => {
    const el = container();
    expect(() => renderWardleyMap(map, el)).not.toThrow();
    const svg = el.querySelector("svg");
    expect(svg).toBeTruthy();
    const texts = Array.from(svg!.querySelectorAll("text")).map(t => t.textContent);
    expect(texts).toContain("Genesis");
    expect(texts).toContain("Commodity");
  });

  it("renders custom stage labels when provided", () => {
    const el = container();
    const customStagesMap: WardleyMap = {
      ...map,
      stages: ["Driver", "Approver", "Contributor", "Informed"],
    };
    renderWardleyMap(customStagesMap, el);
    const svg = el.querySelector("svg");
    const texts = Array.from(svg!.querySelectorAll("text")).map(t => t.textContent);
    expect(texts).toContain("Driver");
    expect(texts).toContain("Informed");
    expect(texts).not.toContain("Genesis");
  });

  it("renders positioned stage labels at non-even x coordinates", () => {
    const el = container();
    const positionedStagesMap: WardleyMap = {
      ...map,
      stages: ["Driver", "Approver", "Contributor", "Informed"],
      stagePositions: [0.05, 0.28, 0.62, 0.95],
    };
    renderWardleyMap(positionedStagesMap, el);
    const svg = el.querySelector("svg")!;
    const labels = Array.from(svg.querySelectorAll(".vzd-wardley-stage-label")) as SVGTextElement[];
    const xs = labels.map((label) => parseFloat(label.getAttribute("x") ?? "0"));
    expect(xs).toHaveLength(4);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[2]).toBeLessThan(xs[3]);
    const d1 = Math.round((xs[1] - xs[0]) * 100) / 100;
    const d2 = Math.round((xs[2] - xs[1]) * 100) / 100;
    const d3 = Math.round((xs[3] - xs[2]) * 100) / 100;
    expect(new Set([d1, d2, d3]).size).toBeGreaterThan(1);
  });

  it("extends the last positioned stage band all the way to the plot's right edge", () => {
    const el = container();
    const positionedStagesMap: WardleyMap = {
      ...map,
      stages: ["Driver", "Approver", "Contributor", "Informed"],
      stagePositions: [0.05, 0.28, 0.62, 0.95],
    };
    renderWardleyMap(positionedStagesMap, el);
    const svg = el.querySelector("svg")!;

    // Canvas geometry mirrors the private constants in wardley.ts
    // (W=800, PAD.left=60, PAD.right=30): plot right edge = 60 + 710 = 770.
    const expectedPlotRight = 770;
    const bandRights = Array.from(svg.querySelectorAll(".vzd-wardley-band")).map((rect) => {
      const x = parseFloat(rect.getAttribute("x") ?? "0");
      const width = parseFloat(rect.getAttribute("width") ?? "0");
      return x + width;
    });
    // The last (shaded) band's right edge must reach evolution = 1 (the
    // plot's true right edge) — not stop short at the last user-supplied
    // position (0.95).
    expect(Math.max(...bandRights)).toBeCloseTo(expectedPlotRight, 5);

    // Only 3 internal dividers for 4 stages — no stray line at the old,
    // now-superseded right edge of the last stage.
    const lines = svg.querySelectorAll(".vzd-wardley-stage-line");
    expect(lines).toHaveLength(3);
  });

  it("keeps positioned stage label coordinates finite for boundary-like inputs", () => {
    const el = container();
    const boundaryStagesMap: WardleyMap = {
      ...map,
      stages: ["Driver", "Approver", "Contributor", "Informed"],
      stagePositions: [0, 0.3, 0.7, 1],
    };
    renderWardleyMap(boundaryStagesMap, el);
    const svg = el.querySelector("svg")!;
    const labels = Array.from(svg.querySelectorAll(".vzd-wardley-stage-label")) as SVGTextElement[];
    const xs = labels.map((label) => Number(label.getAttribute("x")));
    expect(xs).toHaveLength(4);
    expect(xs.every((x) => Number.isFinite(x))).toBe(true);
  });

  it("renders a node for each component", () => {
    const el = container();
    renderWardleyMap(map, el);
    const circles = el.querySelectorAll(".vzd-wardley-node");
    expect(circles).toHaveLength(map.components.length);
  });

  it("renders links between components", () => {
    const el = container();
    renderWardleyMap(map, el);
    const links = el.querySelectorAll(".vzd-wardley-link");
    expect(links).toHaveLength(map.links.length);
  });

  it("ignores links referencing unknown components", () => {
    const el = container();
    const brokenMap: WardleyMap = {
      anchor: null, explicitComponents: new Set(["A"]),
      components: [{ name: "A", visibility: 0.5, evolution: 0.5 }],
      links: [{ from: "A", to: "Ghost" }],
    };
    expect(() => renderWardleyMap(brokenMap, el)).not.toThrow();
  });

  it("renders 10 clustered components at [0.5, 0.5] without throwing", () => {
    const el = container();
    const clustered: WardleyMap = {
      anchor: null, explicitComponents: new Set(["A"]),
      components: Array.from({ length: 10 }, (_, i) => ({
        name: `Component ${i + 1}`,
        visibility: 0.5,
        evolution: 0.5,
      })),
      links: [],
    };
    expect(() => renderWardleyMap(clustered, el)).not.toThrow();
    const svg = el.querySelector("svg");
    expect(svg).toBeTruthy();
    const nodes = svg!.querySelectorAll(".vzd-wardley-node");
    expect(nodes).toHaveLength(10);
    // Labels should be nudged apart up to the cap; at least some should differ
    const labelYs = Array.from(svg!.querySelectorAll(".vzd-wardley-label"))
      .map(t => parseFloat((t as SVGTextElement).getAttribute("y") ?? "0"));
    const uniqueYs = new Set(labelYs.map(y => Math.round(y)));
    // With WARDLEY_LABEL_MAX_NUDGE_PX cap, not all 10 can be unique when
    // clustered at the same point — but nudging should produce more than 1.
    expect(uniqueYs.size).toBeGreaterThan(1);
  });

  it("keeps each label attached to its own component after nudge sorting", () => {
    const el = container();
    const adjacent: WardleyMap = {
      anchor: null,
      explicitComponents: new Set(["A", "B", "C"]),
      components: [
        { name: "A", visibility: 0.60, evolution: 0.20 },
        { name: "B", visibility: 0.59, evolution: 0.21 },
        { name: "C", visibility: 0.58, evolution: 0.22 },
      ],
      links: [],
    };
    renderWardleyMap(adjacent, el);
    const svg = el.querySelector("svg")!;
    const labels = Array.from(svg.querySelectorAll(".vzd-wardley-label")) as SVGTextElement[];
    const circles = Array.from(svg.querySelectorAll(".vzd-wardley-node")) as SVGCircleElement[];

    expect(labels).toHaveLength(3);
    expect(circles).toHaveLength(3);

    labels.forEach((label, idx) => {
      const circle = circles[idx];
      const expectedName = adjacent.components[idx].name;
      expect(label.textContent).toBe(expectedName);
      const labelX = parseFloat(label.getAttribute("x") ?? "0");
      const circleX = parseFloat(circle.getAttribute("cx") ?? "0");
      if ((label.getAttribute("text-anchor") ?? "start") === "end") {
        expect(labelX).toBeLessThan(circleX);
      } else {
        expect(labelX).toBeGreaterThan(circleX);
      }
    });
  });

  it("opens inline rename editor anchored in SVG and cancels with Escape", () => {
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const labels = Array.from(el.querySelectorAll(".vzd-wardley-label")) as SVGTextElement[];
    const authLabel = labels.find((label) => label.textContent === "Auth");
    expect(authLabel).toBeTruthy();

    authLabel!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    const foreignObject = el.querySelector(".vzd-wardley-rename-fo") as SVGForeignObjectElement | null;
    const input = el.querySelector(".vzd-wardley-rename-input") as HTMLInputElement | null;
    expect(foreignObject).toBeTruthy();
    expect(input).toBeTruthy();
    expect(input!.value).toBe("Auth");

    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.querySelector(".vzd-wardley-rename-input")).toBeNull();
    expect(el.querySelector(".vzd-wardley-rename-fo")).toBeNull();
  });

  it("does not start dragging while label rename editor is active", () => {
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const labels = Array.from(el.querySelectorAll(".vzd-wardley-label")) as SVGTextElement[];
    const authLabel = labels.find((label) => label.textContent === "Auth");
    expect(authLabel).toBeTruthy();
    authLabel!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    const draggable = el.querySelector(".vzd-wardley-node--draggable") as SVGCircleElement | null;
    expect(draggable).toBeTruthy();
    draggable!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }));

    expect(draggable!.classList.contains("vzd-wardley-node--dragging")).toBe(false);
  });

  it("keeps add handle visible when moving mouse from node to handle", () => {
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const draggable = el.querySelector(".vzd-wardley-node--draggable") as SVGCircleElement | null;
    const handle = el.querySelector(".vzd-wardley-add-handle-g") as SVGGElement | null;
    expect(draggable).toBeTruthy();
    expect(handle).toBeTruthy();

    draggable!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(handle!.style.display).toBe("");

    draggable!.dispatchEvent(new MouseEvent("mouseleave", {
      bubbles: true,
      relatedTarget: handle!,
    }));

    expect(handle!.style.display).toBe("");
  });

  it("adds new component with link by default on mouse release", () => {
    const addSpy = vi.spyOn(wardleyEdit, "addWardleyComponent").mockReturnValue(true);
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const draggable = el.querySelector(".vzd-wardley-node--draggable") as SVGCircleElement | null;
    const handle = el.querySelector(".vzd-wardley-add-handle-g") as SVGGElement | null;
    expect(draggable).toBeTruthy();
    expect(handle).toBeTruthy();

    draggable!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    handle!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 120, clientY: 120 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 260, clientY: 260 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 260, clientY: 260 }));

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0][7]).toBe(true);
  });

  it("adds component without link when Shift is held on mouse release", () => {
    const addSpy = vi.spyOn(wardleyEdit, "addWardleyComponent").mockReturnValue(true);
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const draggable = el.querySelector(".vzd-wardley-node--draggable") as SVGCircleElement | null;
    const handle = el.querySelector(".vzd-wardley-add-handle-g") as SVGGElement | null;
    expect(draggable).toBeTruthy();
    expect(handle).toBeTruthy();

    draggable!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    handle!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 120, clientY: 120 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 260, clientY: 260 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 260, clientY: 260, shiftKey: true }));

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0][7]).toBe(false);
  });

  it("stops writing and removes its document listeners when the canvas is disconnected mid-drag", async () => {
    const writeSpy = vi.spyOn(wardleyEdit, "writeWardleyComponent").mockReturnValue(true);
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const draggable = el.querySelector(".vzd-wardley-node--draggable") as SVGCircleElement | null;
    expect(draggable).toBeTruthy();
    draggable!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }));
    expect(draggable!.classList.contains("vzd-wardley-node--dragging")).toBe(true);

    // Simulate the canvas being torn down mid-drag (e.g. a re-render
    // triggered by an external edit) before the user releases the mouse.
    el.querySelector(".vzd-wardley-wrap")!.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A stray mouseup afterwards must not write a position computed against
    // the now-detached canvas, and must not throw.
    expect(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 300 }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 300, clientY: 300 }));
    }).not.toThrow();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("stops adding a component and removes its document listeners when the canvas is disconnected mid-link-draw", async () => {
    const addSpy = vi.spyOn(wardleyEdit, "addWardleyComponent").mockReturnValue(true);
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const draggable = el.querySelector(".vzd-wardley-node--draggable") as SVGCircleElement | null;
    const handle = el.querySelector(".vzd-wardley-add-handle-g") as SVGGElement | null;
    expect(draggable).toBeTruthy();
    expect(handle).toBeTruthy();

    draggable!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    handle!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 120, clientY: 120 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 200 }));

    el.querySelector(".vzd-wardley-wrap")!.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 260, clientY: 260 }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 260, clientY: 260 }));
    }).not.toThrow();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("renders an unlink button on links when app/ctx provided and calls removeWardleyLink on click", () => {
    const removeSpy = vi.spyOn(wardleyEdit, "removeWardleyLink").mockReturnValue(true);
    const el = container();
    renderWardleyMap(map, el, {} as any, {} as any);

    const btn = el.querySelector(".vzd-wardley-unlink-btn") as SVGGElement | null;
    expect(btn).toBeTruthy();

    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0][3]).toBe("User");
    expect(removeSpy.mock.calls[0][4]).toBe("Auth");
  });

  it("does not render unlink buttons when app/ctx are absent", () => {
    const el = container();
    renderWardleyMap(map, el);

    expect(el.querySelector(".vzd-wardley-unlink-btn")).toBeNull();
  });
});

// ── renderSIPOC ───────────────────────────────────────────────────────────────

function sipocRow(partial: Partial<SIPOCData["rows"][number]>): SIPOCData["rows"][number] {
  return { supplier: "", input: "", process: "", output: "", customer: "", owner: "", metric: "", ...partial };
}

describe("renderSIPOC — table view", () => {
  it("renders SIPOC table with rows", () => {
    const el = container();
    const data: SIPOCData = {
      variant: "table",
      rows: [
        sipocRow({ supplier: "Dev team", input: "Requirements", process: "Build", output: "Feature", customer: "User" }),
        sipocRow({ supplier: "QA", input: "Test cases", process: "Test", output: "Report", customer: "PM" }),
      ],
      links: [],
    };
    expect(() => renderSIPOC(data, el)).not.toThrow();
    expect(el.querySelector(".vzd-sipoc-wrap")).toBeTruthy();
    const rows = el.querySelectorAll(".vzd-sipoc-row");
    expect(rows).toHaveLength(2);
  });

  it("renders an empty SIPOC without throwing", () => {
    const el = container();
    expect(() => renderSIPOC({ variant: "table", rows: [], links: [] }, el)).not.toThrow();
  });

  it("defaults to table view when variant is omitted", () => {
    const el = container();
    renderSIPOC({ rows: [sipocRow({ supplier: "A" })], links: [] } as unknown as SIPOCData, el);
    expect(el.querySelector(".vzd-sipoc-wrap")).toBeTruthy();
  });
});

// ── renderSIPOC — flow view ─────────────────────────────────────────────────

describe("renderSIPOC — flow view", () => {
  const rows: SIPOCData["rows"] = [
    sipocRow({ supplier: "Vendor", input: "Spec Doc", process: "Review", output: "Report", customer: "PM" }),
  ];

  it("renders SVG with column headers", () => {
    const el = container();
    const data: SIPOCData = { variant: "flow", rows, links: [] };
    expect(() => renderSIPOC(data, el)).not.toThrow();
    const svg = el.querySelector("svg");
    expect(svg).toBeTruthy();
    const labels = Array.from(svg!.querySelectorAll(".vzd-sf-header-label")).map(t => t.textContent);
    expect(labels).toContain("Supplier");
    expect(labels).toContain("Process");
    expect(labels).toContain("Customer");
  });

  it("derives one node per distinct non-empty cell across the 5 core columns", () => {
    const el = container();
    const data: SIPOCData = { variant: "flow", rows, links: [] };
    renderSIPOC(data, el);
    const nodes = el.querySelectorAll(".vzd-sf-node");
    expect(nodes).toHaveLength(5);
  });

  it("merges identical cell text within a column into one shared node", () => {
    const el = container();
    const data: SIPOCData = {
      variant: "flow",
      rows: [
        sipocRow({ supplier: "Acme", input: "A", process: "P1", output: "O1", customer: "C1" }),
        sipocRow({ supplier: "Acme", input: "B", process: "P2", output: "O2", customer: "C2" }),
      ],
      links: [],
    };
    renderSIPOC(data, el);
    // 1 shared supplier + 2 distinct per other column (input/process/output/customer) = 1 + 4*2
    expect(el.querySelectorAll(".vzd-sf-node")).toHaveLength(9);
  });

  it("does not render Owner/Metric in flow view", () => {
    const el = container();
    const data: SIPOCData = {
      variant: "flow",
      rows: [sipocRow({ supplier: "A", owner: "Alice", metric: "99%" })],
      links: [],
    };
    renderSIPOC(data, el);
    expect(el.textContent).not.toContain("Alice");
    expect(el.textContent).not.toContain("99%");
  });

  it("renders links as paths", () => {
    const el = container();
    const data: SIPOCData = { variant: "flow", rows, links: [{ from: "Vendor", to: "Spec Doc" }] };
    renderSIPOC(data, el);
    const links = el.querySelectorAll(".vzd-sf-link");
    expect(links).toHaveLength(1);
  });

  it("shows a flow-view error when a link references unknown text", () => {
    const el = container();
    const data: SIPOCData = { variant: "flow", rows, links: [{ from: "Vendor", to: "Ghost" }] };
    renderSIPOC(data, el);
    expect(el.classList.contains("vizardry-error")).toBe(true);
    expect(el.querySelector(".vzd-sf-node")).toBeFalsy();
  });

  it("shows a flow-view error when a link target is ambiguous across columns", () => {
    const el = container();
    const data: SIPOCData = {
      variant: "flow",
      rows: [sipocRow({ supplier: "Acme", customer: "Acme" })],
      links: [{ from: "Acme", to: "Acme" }],
    };
    renderSIPOC(data, el);
    expect(el.classList.contains("vizardry-error")).toBe(true);
  });

  it("the exact same data renders as a table when variant is table", () => {
    const el = container();
    const data: SIPOCData = { variant: "table", rows, links: [{ from: "Vendor", to: "Spec Doc" }] };
    renderSIPOC(data, el);
    expect(el.querySelector(".vzd-sipoc-wrap")).toBeTruthy();
    expect(el.querySelector("svg")).toBeFalsy();
  });
});

// ── renderVennDiagram ─────────────────────────────────────────────────────────

describe("renderVennDiagram", () => {
  const twoCircle: VennDiagram = {
    circles: [{ name: "Design" }, { name: "Engineering" }],
    regions: [
      { key: "0", items: [{ text: "Research" }] },
      { key: "1", items: [{ text: "Architecture" }] },
      { key: "0+1", items: [{ text: "Prototyping" }] },
    ],
  };

  const threeCircle: VennDiagram = {
    circles: [{ name: "A" }, { name: "B" }, { name: "C" }],
    regions: [
      { key: "0", items: [{ text: "A only" }] },
      { key: "1", items: [{ text: "B only" }] },
      { key: "2", items: [{ text: "C only" }] },
      { key: "0+1+2", items: [{ text: "Center" }] },
    ],
  };

  it("renders SVG for a 2-circle diagram without throwing", () => {
    const el = container();
    expect(() => renderVennDiagram(twoCircle, el, vi.fn())).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });

  it("renders one circle element per circle", () => {
    const el = container();
    renderVennDiagram(twoCircle, el, vi.fn());
    const circles = el.querySelectorAll("circle");
    expect(circles.length).toBe(2);
  });

  it("renders circle labels", () => {
    const el = container();
    renderVennDiagram(twoCircle, el, vi.fn());
    const texts = Array.from(el.querySelectorAll("text")).map(t => t.textContent);
    expect(texts).toContain("Design");
    expect(texts).toContain("Engineering");
  });

  it("renders items in regions", () => {
    const el = container();
    renderVennDiagram(twoCircle, el, vi.fn());
    const items = Array.from(el.querySelectorAll(".vzd-venn-item")).map(e => e.textContent);
    expect(items).toContain("Research");
    expect(items).toContain("Prototyping");
  });

  it("renders a 3-circle diagram without throwing", () => {
    const el = container();
    expect(() => renderVennDiagram(threeCircle, el, vi.fn())).not.toThrow();
    expect(el.querySelectorAll("circle").length).toBe(3);
  });

  it("calls openLink when a wikilink item is clicked", () => {
    const linked: VennDiagram = {
      circles: [{ name: "X" }, { name: "Y" }],
      regions: [
        { key: "0+1", items: [{ text: "Shared", linkTarget: "Shared Note" }] },
      ],
    };
    const el = container();
    const openLink = vi.fn();
    renderVennDiagram(linked, el, openLink);
    const linkItem = el.querySelector<HTMLElement>(".vzd-venn-link");
    linkItem?.click();
    expect(openLink).toHaveBeenCalledWith("Shared Note");
  });

  it("renders without throwing when regions list is empty", () => {
    const el = container();
    const empty: VennDiagram = {
      circles: [{ name: "X" }, { name: "Y" }],
      regions: [],
    };
    expect(() => renderVennDiagram(empty, el, vi.fn())).not.toThrow();
  });
});

// ── renderConceptMap ──────────────────────────────────────────────────────────

describe("renderConceptMap", () => {
  const map: ConceptMap = {
    nodes: ["Photosynthesis", "Sunlight", "Plants", "Oxygen"],
    edges: [
      { from: "Photosynthesis", to: "Sunlight", label: "requires" },
      { from: "Photosynthesis", to: "Plants", label: "occurs in" },
      { from: "Photosynthesis", to: "Oxygen", label: "produces" },
      { from: "Plants", to: "Oxygen", label: "" },
    ],
  };

  it("renders an SVG without throwing", () => {
    const el = container();
    expect(() => renderConceptMap(map, el)).not.toThrow();
    expect(el.querySelector("svg")).toBeTruthy();
  });

  it("renders one rect per node", () => {
    const el = container();
    renderConceptMap(map, el);
    const rects = el.querySelectorAll(".vzd-cmap-node");
    expect(rects).toHaveLength(map.nodes.length);
  });

  it("renders node labels", () => {
    const el = container();
    renderConceptMap(map, el);
    const labels = Array.from(el.querySelectorAll(".vzd-cmap-node-label")).map(t => t.textContent);
    expect(labels).toContain("Photosynthesis");
    expect(labels).toContain("Oxygen");
  });

  it("renders one edge line per edge", () => {
    const el = container();
    renderConceptMap(map, el);
    const edges = el.querySelectorAll(".vzd-cmap-edge");
    expect(edges).toHaveLength(map.edges.length);
  });

  it("renders edge labels for labeled edges only", () => {
    const el = container();
    renderConceptMap(map, el);
    const edgeLabels = el.querySelectorAll(".vzd-cmap-edge-label");
    const labeledCount = map.edges.filter(e => e.label).length;
    expect(edgeLabels).toHaveLength(labeledCount);
  });

  it("renders a minimal two-node graph without throwing", () => {
    const el = container();
    const minimal: ConceptMap = {
      nodes: ["A", "B"],
      edges: [{ from: "A", to: "B", label: "" }],
    };
    expect(() => renderConceptMap(minimal, el)).not.toThrow();
    expect(el.querySelectorAll(".vzd-cmap-node")).toHaveLength(2);
  });

  it("renders an arrow marker definition", () => {
    const el = container();
    renderConceptMap(map, el);
    expect(el.querySelector("#vzd-cmap-arrow")).toBeTruthy();
  });
});

// ── renderCarouselBlock ────────────────────────────────────────────────────────

describe("renderCarouselBlock", () => {
  const data: CarouselBlock = {
    images: [
      { src: "a.png", alt: "Slide 1" },
      { src: "b.png", alt: "Slide 2" },
      { src: "c.png", alt: "Slide 3" },
    ],
  };
  const resolvePath = (src: string) => `/vault/${src}`;

  it("renders carousel wrapper without throwing", () => {
    const el = container();
    expect(() => renderCarouselBlock(data, el, resolvePath)).not.toThrow();
    expect(el.querySelector(".vzd-carousel")).toBeTruthy();
  });

  it("renders one slide per image", () => {
    const el = container();
    renderCarouselBlock(data, el, resolvePath);
    const slides = el.querySelectorAll(".vzd-carousel-slide");
    expect(slides).toHaveLength(3);
  });

  it("sets first slide active, others inactive", () => {
    const el = container();
    renderCarouselBlock(data, el, resolvePath);
    const slides = el.querySelectorAll(".vzd-carousel-slide");
    expect(slides[0].classList.contains("vzd-carousel-slide-active")).toBe(true);
    expect(slides[1].classList.contains("vzd-carousel-slide-active")).toBe(false);
  });

  it("resolves image src via the provided callback", () => {
    const el = container();
    const spy = vi.fn((src: string) => `/vault/${src}`);
    renderCarouselBlock(data, el, spy);
    expect(spy).toHaveBeenCalledWith("a.png");
    expect(spy).toHaveBeenCalledWith("b.png");
    expect(spy).toHaveBeenCalledWith("c.png");
  });

  it("renders description from first image alt", () => {
    const el = container();
    renderCarouselBlock(data, el, resolvePath);
    const desc = el.querySelector(".vzd-carousel-desc");
    expect(desc?.textContent).toBe("Slide 1");
  });

  it("updates description to current slide alt on navigation", () => {
    const el = container();
    renderCarouselBlock(data, el, resolvePath);
    const nextBtn = el.querySelector<HTMLButtonElement>('[data-action="next"]');
    nextBtn?.click();
    const desc = el.querySelector(".vzd-carousel-desc");
    expect(desc?.textContent).toBe("Slide 2");
  });

  it("advances to next slide on next button click", () => {
    const el = container();
    renderCarouselBlock(data, el, resolvePath);
    const nextBtn = el.querySelector<HTMLButtonElement>('[data-action="next"]');
    nextBtn?.click();
    const slides = el.querySelectorAll(".vzd-carousel-slide");
    expect(slides[0].classList.contains("vzd-carousel-slide-active")).toBe(false);
    expect(slides[1].classList.contains("vzd-carousel-slide-active")).toBe(true);
  });

  it("wraps around to last slide when prev clicked from first", () => {
    const el = container();
    renderCarouselBlock(data, el, resolvePath);
    const prevBtn = el.querySelector<HTMLButtonElement>('[data-action="prev"]');
    prevBtn?.click();
    const slides = el.querySelectorAll(".vzd-carousel-slide");
    expect(slides[2].classList.contains("vzd-carousel-slide-active")).toBe(true);
  });
});
