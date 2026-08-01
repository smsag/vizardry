import { describe, it, expect } from "vitest";
import { parseSCQA } from "./scqa";
import type { SCQANode } from "./types";

function flatten(node: SCQANode, out: { text: string; level: number }[] = []): { text: string; level: number }[] {
  out.push({ text: node.text, level: node.level });
  node.children.forEach(c => flatten(c, out));
  return out;
}

describe("parseSCQA — SCQA variant", () => {
  const src = `title: Everything's bad
situation: Status quo
  Complication one
    Question one
      Answer one
    Question two
      Answer two
  Complication two
    Question one
      Answer one`;

  it("builds the situation → complication → question → answer hierarchy", () => {
    const res = parseSCQA(src, "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.variant).toBe("scqa");
    expect(res.data.view).toBe("grid");
    expect(res.data.root.text).toBe("Status quo");
    expect(res.data.root.level).toBe(0);

    const comps = res.data.root.children;
    expect(comps.map(c => c.text)).toEqual(["Complication one", "Complication two"]);
    expect(comps[0].level).toBe(1);
    expect(comps[0].children.map(q => q.text)).toEqual(["Question one", "Question two"]);
    expect(comps[0].children[0].level).toBe(2);
    expect(comps[0].children[0].children[0]).toMatchObject({ text: "Answer one", level: 3 });
  });

  it("strips the title line and does not treat it as a node", () => {
    const res = parseSCQA(src, "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(flatten(res.data.root).some(n => n.text.startsWith("title"))).toBe(false);
  });

  it("rejects a source with no situation", () => {
    const res = parseSCQA("  Just a complication", "scqa");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/situation/i);
  });

  it("rejects a duplicate situation", () => {
    const res = parseSCQA("situation: A\nsituation: B", "scqa");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/duplicate/i);
  });

  it("rejects nesting deeper than answer (level 4)", () => {
    const deep = `situation: S
  Complication
    Question
      Answer
        Too deep`;
    const res = parseSCQA(deep, "scqa");
    expect(res.ok).toBe(false);
  });

  it("allows a question to carry more than one answer", () => {
    const multi = `situation: S
  Complication
    Question
      Answer one
      Answer two
      Answer three`;
    const res = parseSCQA(multi, "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const question = res.data.root.children[0].children[0];
    expect(question.children.map(a => a.text)).toEqual(["Answer one", "Answer two", "Answer three"]);
    expect(question.children.every(a => a.level === 3)).toBe(true);
  });
});

describe("parseSCQA — SCR variant", () => {
  const src = `situation: Uptime was solid
  A config push broke payments
    Add a staged rollout canary`;

  it("builds a 3-level situation → complication → resolution hierarchy", () => {
    const res = parseSCQA(src, "scr");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.variant).toBe("scr");
    const comp = res.data.root.children[0];
    expect(comp).toMatchObject({ text: "A config push broke payments", level: 1 });
    expect(comp.children[0]).toMatchObject({ text: "Add a staged rollout canary", level: 2 });
  });

  it("rejects a 4th level (scr caps at resolution)", () => {
    const res = parseSCQA(`situation: S
  Complication
    Resolution
      Too deep`, "scr");
    expect(res.ok).toBe(false);
  });
});

describe("parseSCQA — keyword form", () => {
  it("parses the situation → complication → question → answer chain, stripping keywords", () => {
    const src = `situation: Status quo
  complication: Competitor shipped one-click checkout
    question: How fast can we match it?
      answer: Ship in Q3
      answer: Buy a wallet layer
  complication: Cart abandonment is up`;
    const res = parseSCQA(src, "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.root.text).toBe("Status quo");
    const comps = res.data.root.children;
    expect(comps.map(c => c.text)).toEqual([
      "Competitor shipped one-click checkout",
      "Cart abandonment is up",
    ]);
    const question = comps[0].children[0];
    expect(question).toMatchObject({ text: "How fast can we match it?", level: 2 });
    expect(question.children.map(a => a.text)).toEqual(["Ship in Q3", "Buy a wallet layer"]);
    expect(question.children.every(a => a.level === 3)).toBe(true);
  });

  it("parses the scr situation → complication → resolution chain", () => {
    const src = `situation: Uptime was solid
  complication: A config push broke payments
    resolution: Add a staged rollout canary
    resolution: Alert on error-rate spikes`;
    const res = parseSCQA(src, "scr");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const comp = res.data.root.children[0];
    expect(comp).toMatchObject({ text: "A config push broke payments", level: 1 });
    expect(comp.children.map(r => r.text)).toEqual([
      "Add a staged rollout canary",
      "Alert on error-rate spikes",
    ]);
    expect(comp.children.every(r => r.level === 2)).toBe(true);
  });

  it("rejects a question that is not nested under a complication", () => {
    const res = parseSCQA("situation: S\n  question: Orphan", "scqa");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/must be nested under a "complication:"/);
  });

  it("treats an out-of-vocabulary keyword as a bullet (answer in the scr variant)", () => {
    // With bullets enabled, a line that is not a valid level keyword for the
    // variant becomes a chevron bullet on the enclosing node rather than an error.
    const res = parseSCQA("situation: S\n  complication: C\n    answer: nope", "scr");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.root.children[0].bullets).toEqual(["answer: nope"]);
  });

  it("collects bare indented lines as bullets on the enclosing node", () => {
    const res = parseSCQA(
      "situation: S\n  complication: C\n    question: Q\n      answer: A\n        Backed by usage data\n        Low build cost",
      "scqa",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const answer = res.data.root.children[0].children[0].children[0];
    expect(answer.text).toBe("A");
    expect(answer.bullets).toEqual(["Backed by usage data", "Low build cost"]);
  });
});

describe("parseSCQA — config lines", () => {
  it("reads view: tree", () => {
    const res = parseSCQA("view: tree\nsituation: S", "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.view).toBe("tree");
  });

  it("lets type: override the fence variant", () => {
    const res = parseSCQA("type: scr\nsituation: S\n  C\n    R", "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.variant).toBe("scr");
  });

  it("still parses the legacy bare-indent form structurally (bullets don't force strict)", () => {
    // No child keywords → legacy parse; C and R are nodes, not bullets.
    const res = parseSCQA("situation: S\n  C\n    R", "scqa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(flatten(res.data.root)).toEqual([
      { text: "S", level: 0 }, { text: "C", level: 1 }, { text: "R", level: 2 },
    ]);
    expect(res.data.root.children[0].bullets ?? []).toEqual([]);
  });

  it("rejects an unknown view", () => {
    const res = parseSCQA("view: sideways\nsituation: S", "scqa");
    expect(res.ok).toBe(false);
  });
});
