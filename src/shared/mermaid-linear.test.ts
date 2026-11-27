// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "../test-setup";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
const { linear, openTicketCard } = vi.hoisted(() => ({
  linear: { enabled: true },
  openTicketCard: vi.fn(),
}));
vi.mock("../linear", () => ({ getLinearService: () => ({ isEnabled: () => linear.enabled }) }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));
vi.mock("../sideleaf", () => ({ openTicketCard }));

import { LINEAR_KEY_RE, enrichLinearKeys, enrichMermaidLinearKeys, enrichMermaidWhenDrawn } from "./linear-enrichment";
import { classifyTicketTarget } from "./links";
// Copied unchanged from the Nimbus repository, Contracts/mermaid-linear-cases.json
// (the test cases of Contracts/MERMAID-LINEAR.md, shared by Nimbus and Vizardry).
// Vizardry runs `keys` and `labels`; `rewrites` are Nimbus's (it writes the block).
import cases from "./__fixtures__/mermaid-linear-cases.json";

// A flowchart as Obsidian 1.15's own renderer (Pele 1.13.0, Obsidian's lib/pele.min.js)
// draws it: pele.render() output for a diagram with a subgraph "Epic PSS2-100", an edge
// label "blocks D-8", node a "Country backfill + data lake (PSS2-105 · In Review)", node b
// "PSC-327 · Todo · bulk recalculation", node c "Backfill<br>PSS2-7 · Done", node d
// "Ticket A (L-04)" and node e "Linked CORE-9" with `click e href`.
const PELE_SVG = readFileSync(resolve(__dirname, "__fixtures__/pele-flowchart.svg"), "utf8");

const SVG_NS = "http://www.w3.org/2000/svg";
// The contract's pattern as written there (§ 1), with its lookbehind: the reference.
const CONTRACT_RE = /(?<![A-Za-z0-9_/-])([A-Z][A-Z0-9]{0,9})-([1-9][0-9]{0,6})(?![A-Za-z0-9_-])/g;
const keysOf = (re: RegExp, text: string): string[] =>
  Array.from(text.matchAll(new RegExp(re.source, "g")), m => m[1] + (m[2] ? `-${m[2]}` : ""));

beforeEach(() => {
  linear.enabled = true;
  openTicketCard.mockClear();
  document.body.innerHTML = "";
});

/** A Mermaid.js flowchart <svg> (Obsidian before 1.15). */
function mermaidSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("aria-roledescription", "flowchart-v2");
  return svg;
}

/** A node as Mermaid.js draws it with HTML labels. `html` is the label's inner HTML. */
function htmlNode(svg: Element, html: string, cls = "node"): HTMLElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", cls);
  const fo = document.createElementNS(SVG_NS, "foreignObject");
  const div = document.createElement("div");
  div.innerHTML = `<span class="nodeLabel"><p>${html}</p></span>`;
  fo.appendChild(div);
  g.appendChild(fo);
  svg.appendChild(g);
  return div;
}

/** The Pele fixture, drawn into a `.mermaid` host inside a section element. */
function peleSection(): { el: HTMLElement; host: HTMLElement } {
  const el = document.createElement("div");
  const host = el.appendChild(document.createElement("div"));
  host.className = "mermaid";
  host.innerHTML = PELE_SVG;
  document.body.appendChild(el);
  return { el, host };
}

const peleLabel = (host: Element, id: string): SVGTextElement =>
  host.querySelector(`g.pele-node[data-id="${id}"] text.pele-label`)!;

describe("LINEAR_KEY_RE (contract § 1)", () => {
  it.each(cases.keys)("$text", ({ text, keys }) => {
    expect(keysOf(LINEAR_KEY_RE, text)).toEqual(keys);
  });

  it.each([
    ["at the start of a line", "intro\nPSS2-105 first", ["PSS2-105"]],
    ["directly after (", "(PSS2-105) and (D-8 · Done)", ["PSS2-105", "D-8"]],
    ["one character apart", "CORE-1,CORE-2 CORE-3;CORE-4", ["CORE-1", "CORE-2", "CORE-3", "CORE-4"]],
  ])("finds a key %s", (_name, text, keys) => {
    expect(keysOf(LINEAR_KEY_RE, text as string)).toEqual(keys);
  });

  it("matches exactly what the contract's lookbehind pattern matches", () => {
    const parts = ["CORE-12", "PSS2-105", "D-8", "L-04", "x", "X", "_", "/", "-", "(", " ", "\n", "·", "7", "a1", "Ö"];
    // Every sequence of up to three parts: covers each neighbour on either side of a key.
    for (const a of parts) for (const b of parts) for (const c of parts) {
      const text = a + b + c;
      expect(keysOf(LINEAR_KEY_RE, text), text).toEqual(keysOf(CONTRACT_RE, text));
    }
  });

  it("is written without a lookbehind (Safari before 16.4 cannot parse one)", () => {
    expect(LINEAR_KEY_RE.source).not.toContain("(?<");
  });

  it("classifies a whole link target by the same pattern", () => {
    expect(classifyTicketTarget("PSS2-105")).toEqual({ service: "linear", key: "PSS2-105" });
    expect(classifyTicketTarget("D-8")).toEqual({ service: "linear", key: "D-8" });
    expect(classifyTicketTarget("L-04")).toBeNull();
    expect(classifyTicketTarget("xCORE-1")).toBeNull();
    expect(classifyTicketTarget("@CORE-1")).toBeNull();
    expect(classifyTicketTarget("(CORE-1")).toBeNull();
    expect(LINEAR_KEY_RE.lastIndex).toBe(0);
  });
});

describe("enrichLinearKeys", () => {
  it("leaves the character before a key as text", () => {
    const el = document.createElement("div");
    el.textContent = "Backfill (PSS2-105 · In Review)";
    enrichLinearKeys(el);
    expect(el.querySelector(".vzd-linear-key")?.textContent).toBe("PSS2-105");
    expect(el.textContent).toBe("Backfill (PSS2-105 · In Review)");
  });

  it("finds a key next to a line break", () => {
    const el = document.createElement("p");
    el.innerHTML = "Backfill<br>PSS2-105 is done";
    enrichLinearKeys(el);
    expect(el.querySelector(".vzd-linear-key")?.textContent).toBe("PSS2-105");
  });

  it("never puts a badge into SVG text, but still into a foreignObject's HTML", () => {
    const el = document.createElement("div");
    const svg = el.appendChild(document.createElementNS(SVG_NS, "svg"));
    const text = svg.appendChild(document.createElementNS(SVG_NS, "text"));
    const tspan = text.appendChild(document.createElementNS(SVG_NS, "tspan"));
    tspan.textContent = "Ship Q3-2025 launch PSS2-105";
    const fo = svg.appendChild(document.createElementNS(SVG_NS, "foreignObject"));
    const card = fo.appendChild(document.createElement("div"));
    card.textContent = "Card CORE-12";
    enrichLinearKeys(el);
    expect(tspan.textContent).toBe("Ship Q3-2025 launch PSS2-105");
    expect(text.querySelector("button")).toBeNull();
    expect(card.querySelector(".vzd-linear-key")?.textContent).toBe("CORE-12");
  });

  it("leaves a drawn Mermaid diagram to the Mermaid pass", () => {
    const { el, host } = peleSection();
    enrichLinearKeys(el);
    expect(host.querySelector("button")).toBeNull();
    expect(host.querySelector(".pele-edge-label")?.textContent).toContain("D-8");
  });
});

describe("enrichMermaidLinearKeys (contract § 6)", () => {
  it.each(cases.labels)("Mermaid.js HTML label: $label", ({ label, badges, text }) => {
    const svg = mermaidSvg();
    const div = htmlNode(svg, "");
    div.querySelector("p")!.textContent = label;
    enrichMermaidLinearKeys(svg);
    const found = Array.from(div.querySelectorAll(".vzd-linear-key"));
    expect(found.map(b => b.textContent)).toEqual(badges);
    found.forEach(b => b.remove());
    expect(div.textContent).toBe(text);
  });

  it("Mermaid.js: badges a key after a <br>, leaves edge labels, subgraph titles and linked nodes plain", () => {
    const svg = mermaidSvg();
    const multi = htmlNode(svg, "Backfill<br>PSS2-105 · Done");
    const edge = htmlNode(svg, "PSS2-105", "edgeLabel");
    const cluster = htmlNode(svg, "PSS2-105", "cluster-label");
    const a = svg.appendChild(document.createElementNS(SVG_NS, "a"));
    const linked = htmlNode(a, "Linked CORE-9");
    enrichMermaidLinearKeys(svg);
    expect(multi.querySelector(".vzd-linear-key")?.textContent).toBe("PSS2-105");
    for (const div of [edge, cluster, linked]) expect(div.querySelector(".vzd-linear-key")).toBeNull();
  });

  it("only touches flowcharts", () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-roledescription", "stateDiagram");
    const div = htmlNode(svg, "Review: PSS2-105 waiting");
    enrichMermaidLinearKeys(svg);
    expect(div.querySelector(".vzd-linear-key")).toBeNull();
  });

  it("Pele: each node label holding a key becomes a button for it, and the SVG keeps its text", () => {
    const { host } = peleSection();
    const before = host.querySelector("svg")!.textContent;
    enrichMermaidLinearKeys(host.querySelector("svg")!);
    const buttons = Array.from(host.querySelectorAll(".vzd-mermaid-linear-key"));
    expect(buttons.map(t => t.getAttribute("aria-label"))).toEqual([
      "Country backfill + data lake (PSS2-105 · In Review) (Linear: PSS2-105)",
      "PSC-327 · Todo · bulk recalculation (Linear: PSC-327)",
      "Backfill PSS2-7 · Done (Linear: PSS2-7)",
    ]);
    for (const t of buttons) {
      expect(t.getAttribute("role")).toBe("button");
      expect(t.getAttribute("tabindex")).toBe("0");
    }
    expect(host.querySelector("svg button, svg .vzd-linear-key")).toBeNull();
    expect(host.querySelector("svg")!.textContent).toBe(before);
    // Not a key, a linked node, an edge label, a subgraph title: untouched.
    expect(peleLabel(host, "d").classList.contains("vzd-mermaid-linear-key")).toBe(false);
    expect(peleLabel(host, "e").hasAttribute("role")).toBe(false);
    expect(host.querySelector(".pele-edge-label [role], .pele-cluster-label [role]")).toBeNull();
  });

  it("Pele: opens the key's card on click, Enter and Space, once per enrichment", () => {
    const { host } = peleSection();
    const svg = host.querySelector("svg")!;
    enrichMermaidLinearKeys(svg);
    enrichMermaidLinearKeys(svg);
    const label = peleLabel(host, "a");
    label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    label.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    label.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    label.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(openTicketCard).toHaveBeenCalledTimes(3);
    const host2 = vi.fn();
    host.addEventListener("pointerdown", host2);
    host.addEventListener("dblclick", host2);
    label.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(host2).not.toHaveBeenCalled();
    expect(openTicketCard).toHaveBeenCalledWith({ service: "linear", key: "PSS2-105" });
  });
});

describe("enrichMermaidWhenDrawn", () => {
  const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

  it("enriches a diagram drawn after the post-processor, a second one drawn later, and a redraw", async () => {
    const el = document.createElement("div");
    const first = el.appendChild(document.createElement("div"));
    first.className = "mermaid";
    const pre = el.appendChild(document.createElement("pre"));
    pre.innerHTML = `<code class="language-mermaid">flowchart LR</code>`;
    document.body.appendChild(el);
    enrichMermaidWhenDrawn(el);

    first.innerHTML = PELE_SVG;
    await flush();
    expect(first.querySelectorAll(".vzd-mermaid-linear-key")).toHaveLength(3);

    const second = document.createElement("div");
    second.className = "mermaid";
    second.innerHTML = PELE_SVG;
    pre.replaceWith(second);
    await flush();
    expect(second.querySelectorAll(".vzd-mermaid-linear-key")).toHaveLength(3);

    first.innerHTML = PELE_SVG; // the renderer redraws with a new <svg>
    await flush();
    expect(first.querySelectorAll(".vzd-mermaid-linear-key")).toHaveLength(3);
  });

  it("enriches a diagram already drawn when the post-processor runs", () => {
    const { el, host } = peleSection();
    enrichMermaidWhenDrawn(el);
    expect(host.querySelectorAll(".vzd-mermaid-linear-key")).toHaveLength(3);
  });

  it("adds nothing once Linear is turned off", async () => {
    const el = document.createElement("div");
    const host = el.appendChild(document.createElement("div"));
    host.className = "mermaid";
    enrichMermaidWhenDrawn(el);
    linear.enabled = false;
    host.innerHTML = PELE_SVG;
    await flush();
    expect(host.querySelector(".vzd-mermaid-linear-key")).toBeNull();
  });

  it("ignores sections without a Mermaid block", async () => {
    const el = document.createElement("div");
    el.textContent = "PSC-327";
    enrichMermaidWhenDrawn(el);
    const host = el.appendChild(document.createElement("div"));
    host.className = "mermaid";
    host.innerHTML = PELE_SVG;
    await flush();
    expect(host.querySelector(".vzd-mermaid-linear-key")).toBeNull();
  });
});
