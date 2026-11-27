// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import "../test-setup";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
vi.mock("../linear", () => ({ getLinearService: () => ({ isEnabled: () => true }) }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));
const { openTicketCard } = vi.hoisted(() => ({ openTicketCard: vi.fn() }));
vi.mock("../sideleaf", () => ({ openTicketCard }));

import { LINEAR_KEY_RE, enrichMermaidLinearKeys, enrichMermaidWhenDrawn } from "./linear-enrichment";
import { classifyTicketTarget } from "./links";
// Copied unchanged from the Nimbus repository, Contracts/mermaid-linear-cases.json
// (the test cases of Contracts/MERMAID-LINEAR.md, shared by Nimbus and Vizardry).
// Vizardry runs `keys` and `labels`; `rewrites` are Nimbus's (it writes the block).
import cases from "./__fixtures__/mermaid-linear-cases.json";

const SVG_NS = "http://www.w3.org/2000/svg";

/** A flowchart node as Mermaid draws it with HTML labels. */
function htmlNode(svg: Element, label: string, cls = "node"): HTMLElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", cls);
  const fo = document.createElementNS(SVG_NS, "foreignObject");
  const div = document.createElement("div");
  div.innerHTML = `<span class="nodeLabel"><p></p></span>`;
  div.querySelector("p")!.textContent = label;
  fo.appendChild(div);
  g.appendChild(fo);
  svg.appendChild(g);
  return div;
}

describe("LINEAR_KEY_RE (contract § 1)", () => {
  it.each(cases.keys)("$text", ({ text, keys }) => {
    expect(Array.from(text.matchAll(LINEAR_KEY_RE), m => m[1])).toEqual(keys);
  });

  it("classifies a whole link target by the same pattern", () => {
    expect(classifyTicketTarget("PSS2-105")).toEqual({ service: "linear", key: "PSS2-105" });
    expect(classifyTicketTarget("D-8")).toEqual({ service: "linear", key: "D-8" });
    expect(classifyTicketTarget("L-04")).toBeNull();
  });
});

describe("enrichMermaidLinearKeys (contract § 6)", () => {
  it.each(cases.labels)("$label", ({ label, badges, text }) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const div = htmlNode(svg, label);
    enrichMermaidLinearKeys(svg);
    const found = Array.from(div.querySelectorAll(".vzd-linear-key"));
    expect(found.map(b => b.textContent)).toEqual(badges);
    found.forEach(b => b.remove());
    expect(div.textContent).toBe(text);
  });

  it("leaves edge labels and subgraph titles plain", () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const edge = htmlNode(svg, "PSS2-105", "edgeLabel");
    const cluster = htmlNode(svg, "PSS2-105", "cluster-label");
    enrichMermaidLinearKeys(svg);
    expect(edge.querySelector(".vzd-linear-key")).toBeNull();
    expect(cluster.querySelector(".vzd-linear-key")).toBeNull();
  });

  it("makes an SVG-text label open its first key without putting a button in the SVG", () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "node");
    const text = document.createElementNS(SVG_NS, "text");
    text.textContent = "Backfill (PSS2-105 · Done)";
    g.appendChild(text);
    svg.appendChild(g);
    document.body.appendChild(svg);
    enrichMermaidLinearKeys(svg);
    enrichMermaidLinearKeys(svg); // idempotent: one handler, one open
    expect(svg.querySelector("button")).toBeNull();
    expect(text.textContent).toBe("Backfill (PSS2-105 · Done)");
    text.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(openTicketCard).toHaveBeenCalledTimes(1);
    expect(openTicketCard).toHaveBeenCalledWith({ service: "linear", key: "PSS2-105" });
    svg.remove();
  });
});

describe("enrichMermaidWhenDrawn", () => {
  it("badges the labels once Mermaid has swapped its SVG in", async () => {
    const el = document.createElement("div");
    const host = el.appendChild(document.createElement("div"));
    host.className = "mermaid";
    enrichMermaidWhenDrawn(el);
    const svg = document.createElementNS(SVG_NS, "svg");
    const div = htmlNode(svg, "PSC-327 · Todo · bulk recalculation");
    host.appendChild(svg);
    await new Promise(r => setTimeout(r, 0));
    expect(div.querySelector(".vzd-linear-key")?.textContent).toBe("PSC-327");
  });

  it("ignores sections without a Mermaid block", () => {
    const el = document.createElement("div");
    el.textContent = "PSC-327";
    const spy = vi.spyOn(globalThis, "MutationObserver");
    enrichMermaidWhenDrawn(el);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
