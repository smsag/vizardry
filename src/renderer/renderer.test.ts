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
import { renderSIPOCFlow } from "./sipoc-flow";

import type {
  FrameworkDefinition,
  TreeNode,
  OSTTree,
  MindMap,
  ImpactMap,
  StoryMap,
  WardleyMap,
  SIPOCData,
  SIPOCFlowData,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
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
    description: "",
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
    renderCanvas(swot, { strengths: "Fast team", weaknesses: "" }, {}, el, vi.fn());
    expect(el.querySelector(".vizardry-grid")).toBeTruthy();
    const blocks = el.querySelectorAll(".vizardry-block");
    expect(blocks).toHaveLength(4);
  });

  it("renders block content as lines", () => {
    const el = container();
    renderCanvas(swot, { strengths: "Line one\nLine two" }, {}, el, vi.fn());
    const lines = el.querySelectorAll(".vzd-block-line");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toBe("Line one");
  });

  it("marks empty block with empty class", () => {
    const el = container();
    renderCanvas(swot, {}, {}, el, vi.fn());
    const bodies = el.querySelectorAll(".vizardry-block-empty");
    expect(bodies.length).toBeGreaterThan(0);
  });

  it("renders link button when _links entry exists", () => {
    const el = container();
    renderCanvas(swot, {}, { strengths: "Strategy Section" }, el, vi.fn());
    expect(el.querySelector(".vizardry-block-link-btn")).toBeTruthy();
  });

  it("link button calls navigateTo with the heading", () => {
    const el = container();
    const navigateTo = vi.fn();
    renderCanvas(swot, {}, { strengths: "My Heading" }, el, navigateTo);
    const btn = el.querySelector<HTMLButtonElement>(".vizardry-block-link-btn");
    btn?.click();
    expect(navigateTo).toHaveBeenCalledWith("My Heading");
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
    anchor: "User",
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
      anchor: null,
      components: [{ name: "A", visibility: 0.5, evolution: 0.5 }],
      links: [{ from: "A", to: "Ghost" }],
    };
    expect(() => renderWardleyMap(brokenMap, el)).not.toThrow();
  });
});

// ── renderSIPOC ───────────────────────────────────────────────────────────────

describe("renderSIPOC", () => {
  it("renders SIPOC table with rows", () => {
    const el = container();
    const data: SIPOCData = {
      rows: [
        { supplier: "Dev team", input: "Requirements", process: "Build", output: "Feature", customer: "User" },
        { supplier: "QA", input: "Test cases", process: "Test", output: "Report", customer: "PM" },
      ],
    };
    expect(() => renderSIPOC(data, el)).not.toThrow();
    expect(el.querySelector(".vzd-sipoc-wrap")).toBeTruthy();
    const rows = el.querySelectorAll(".vzd-sipoc-row");
    expect(rows).toHaveLength(2);
  });

  it("renders an empty SIPOC without throwing", () => {
    const el = container();
    expect(() => renderSIPOC({ rows: [] }, el)).not.toThrow();
  });
});

// ── renderSIPOCFlow ───────────────────────────────────────────────────────────

describe("renderSIPOCFlow", () => {
  const flowData: SIPOCFlowData = {
    nodes: [
      { id: "vendor", label: "Vendor", shape: "ellipse", column: "suppliers" },
      { id: "spec", label: "Spec Doc", shape: "parallelogram", column: "inputs" },
      { id: "review", label: "Review", shape: "rect", column: "process" },
      { id: "report", label: "Report", shape: "parallelogram", column: "outputs" },
      { id: "pm", label: "PM", shape: "ellipse", column: "customers" },
    ],
    links: [
      { from: "vendor", to: "spec" },
      { from: "spec", to: "review" },
      { from: "review", to: "report" },
      { from: "report", to: "pm" },
    ],
  };

  it("renders SVG with column headers", () => {
    const el = container();
    expect(() => renderSIPOCFlow(flowData, el)).not.toThrow();
    const svg = el.querySelector("svg");
    expect(svg).toBeTruthy();
    const labels = Array.from(svg!.querySelectorAll(".vzd-sf-header-label")).map(t => t.textContent);
    expect(labels).toContain("Suppliers");
    expect(labels).toContain("Process");
    expect(labels).toContain("Customers");
  });

  it("renders one shape per node", () => {
    const el = container();
    renderSIPOCFlow(flowData, el);
    const nodes = el.querySelectorAll(".vzd-sf-node");
    expect(nodes).toHaveLength(flowData.nodes.length);
  });

  it("renders links as paths", () => {
    const el = container();
    renderSIPOCFlow(flowData, el);
    const links = el.querySelectorAll(".vzd-sf-link");
    expect(links).toHaveLength(flowData.links.length);
  });

  it("ignores links to unknown nodes without throwing", () => {
    const el = container();
    const broken: SIPOCFlowData = {
      nodes: [{ id: "a", label: "A", shape: "rect", column: "process" }],
      links: [{ from: "a", to: "ghost" }],
    };
    expect(() => renderSIPOCFlow(broken, el)).not.toThrow();
  });
});
