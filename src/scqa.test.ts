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

  it("rejects an unknown view", () => {
    const res = parseSCQA("view: sideways\nsituation: S", "scqa");
    expect(res.ok).toBe(false);
  });
});
