import { describe, it, expect } from "vitest";
import { parseWardleyMap } from "./wardley";

describe("parseWardleyMap", () => {
  it("parses a minimal valid map", () => {
    const src = `
anchor: User
component: Feature [0.9, 0.3]
link: User -> Feature
`.trim();
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.anchor).toBe("User");
    expect(result.data.components).toHaveLength(2);
    expect(result.data.links).toHaveLength(1);
    expect(result.data.links[0]).toEqual({ from: "User", to: "Feature" });
  });

  it("anchor auto-creates a component at [1, 0]", () => {
    const src = `anchor: Customer\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const anchor = result.data.components.find(c => c.name === "Customer");
    expect(anchor).toBeDefined();
    expect(anchor!.visibility).toBe(1);
    expect(anchor!.evolution).toBe(0);
  });

  it("component declaration overrides anchor defaults", () => {
    const src = `anchor: Customer\ncomponent: Customer [0.95, 0.6]`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.data.components.find(c => c.name === "Customer")!;
    expect(c.visibility).toBe(0.95);
    expect(c.evolution).toBe(0.6);
  });

  it("ignores blank lines and comments", () => {
    const src = `// this is a map\nanchor: User\n\ncomponent: DB [0.2, 0.8]`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
  });

  it("parses custom x-axis stages", () => {
    const src = `stages: Driver | Approver | Contributor | Informed\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stages).toEqual(["Driver", "Approver", "Contributor", "Informed"]);
  });

  it("parses positioned x-axis stages", () => {
    const src = `stages:\n  0.05: Driver\n  0.28: Approver\n  0.62: Contributor\n  0.95: Informed\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stages).toEqual(["Driver", "Approver", "Contributor", "Informed"]);
    expect(result.data.stagePositions).toEqual([0.05, 0.28, 0.62, 0.95]);
  });

  // ── Graceful degradation: recoverable issues warn, the map still renders ────

  function warnings(src: string): string[] {
    const r = parseWardleyMap(src);
    expect(r.ok).toBe(true);
    return r.ok ? (r.data.warnings ?? []) : [];
  }

  it("drops non-increasing positioned stages and falls back to defaults, with a warning", () => {
    const src = `stages:\n  0.4: Product\n  0.2: Custom\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stages).toBeUndefined();
    expect(result.data.warnings?.some(w => /increase/.test(w))).toBe(true);
  });

  it("drops duplicate positioned stages with a warning", () => {
    expect(warnings(`stages:\n  0.4: Product\n  0.4: Commodity\ncomponent: API [0.5, 0.5]`)
      .some(w => /duplicate stages position/.test(w))).toBe(true);
  });

  it("drops out-of-range positioned stages with a warning", () => {
    expect(warnings(`stages:\n  1.2: Commodity\n  0.8: Product\ncomponent: API [0.5, 0.5]`)
      .some(w => /between 0 and 1/.test(w))).toBe(true);
  });

  it("drops a 0 positioned-stage endpoint with a warning", () => {
    expect(warnings(`stages:\n  0: Driver\n  0.5: Contributor\ncomponent: API [0.5, 0.5]`)
      .some(w => /between 0 and 1/.test(w))).toBe(true);
  });

  it("drops empty inline stage labels rather than failing", () => {
    const result = parseWardleyMap("stages: Driver |  | Informed\ncomponent: API [0.5, 0.5]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stages).toEqual(["Driver", "Informed"]);
  });

  it("falls back to default stages (with a warning) when fewer than two labels", () => {
    const result = parseWardleyMap("stages: Driver\ncomponent: API [0.5, 0.5]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stages).toBeUndefined();
    expect(result.data.warnings?.some(w => /at least two labels/.test(w))).toBe(true);
  });

  it("skips a component missing coordinates (with a warning) instead of failing", () => {
    const result = parseWardleyMap("component: A [0.5, 0.5]\ncomponent: NoBrackets");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components).toHaveLength(1);
    expect(result.data.warnings?.some(w => /coordinates/.test(w))).toBe(true);
  });

  it("clamps out-of-range component coordinates to 0–1 with a warning", () => {
    const result = parseWardleyMap("component: X [1.5, 0.5]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components[0].visibility).toBe(1);
    expect(result.data.warnings?.some(w => /clamped/.test(w))).toBe(true);
  });

  it("skips a link with a missing arrow, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5, 0.5]\nlink: A to B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toHaveLength(0);
    expect(result.data.warnings?.some(w => /->/.test(w))).toBe(true);
  });

  it("skips a link to an unknown component, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5, 0.5]\nlink: A -> Ghost");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toHaveLength(0);
    expect(result.data.warnings?.some(w => /Ghost/.test(w))).toBe(true);
  });

  it("skips an unrecognised line, with a warning", () => {
    expect(warnings("component: A [0.5, 0.5]\nmovement: X")
      .some(w => /unrecognised line/.test(w))).toBe(true);
  });

  it("still errors (fatal) when no components are defined", () => {
    const result = parseWardleyMap("// just a comment");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("No components") });
  });

  // ── Inline comment stripping ────────────────────────────────────────────────

  it("strips a trailing // comment on a component line", () => {
    const result = parseWardleyMap("component: Web [0.5, 0.5] // the app");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components[0]).toEqual({ name: "Web", visibility: 0.5, evolution: 0.5 });
  });

  it("strips a trailing // comment on a link line", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\ncomponent: B [0.3,0.3]\nlink: A -> B // dependency");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "A", to: "B" }]);
  });

  it("strips a trailing // comment on inline and positioned stages", () => {
    const inline = parseWardleyMap("stages: Genesis | Custom // note\ncomponent: A [0.5,0.5]");
    expect(inline.ok && inline.data.stages).toEqual(["Genesis", "Custom"]);
    const positioned = parseWardleyMap("stages:\n  0.3: Genesis // a\n  0.7: Custom\ncomponent: A [0.5,0.5]");
    expect(positioned.ok && positioned.data.stages).toEqual(["Genesis", "Custom"]);
  });

  // ── Duplicate components ────────────────────────────────────────────────────

  it("ignores a duplicate component (first wins) with a warning", () => {
    const result = parseWardleyMap("component: Auth [0.5,0.5]\ncomponent: Auth [0.2,0.2]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components).toHaveLength(1);
    expect(result.data.components[0].visibility).toBe(0.5);
    expect(result.data.warnings?.some(w => /duplicate component/.test(w))).toBe(true);
  });

  it("ignores a case-insensitive duplicate component with a warning", () => {
    const result = parseWardleyMap("component: Auth [0.5,0.5]\ncomponent: auth [0.2,0.2]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components).toHaveLength(1);
    expect(result.data.warnings?.some(w => /duplicate component/.test(w))).toBe(true);
  });

  // ── Links: case-insensitive resolution, self-links, duplicates ──────────────

  it("resolves link endpoints case-insensitively to the declared name", () => {
    const result = parseWardleyMap("component: Web App [0.8,0.4]\ncomponent: DB [0.3,0.6]\nlink: web app -> db");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "Web App", to: "DB" }]);
  });

  it("skips a self-link with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nlink: A -> a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toHaveLength(0);
    expect(result.data.warnings?.some(w => /itself/.test(w))).toBe(true);
  });

  it("drops exact-duplicate links", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\ncomponent: B [0.3,0.3]\nlink: A -> B\nlink: a -> b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "A", to: "B" }]);
  });

  // ── evolve (movement) ───────────────────────────────────────────────────────

  it("parses an evolve directive onto its component (case-insensitive, spaced name)", () => {
    const result = parseWardleyMap("component: Web App [0.8, 0.4]\nevolve: web app 0.9");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components[0].evolveTo).toBe(0.9);
  });

  it("skips an evolve to an unknown component with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: Ghost 0.8");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components[0].evolveTo).toBeUndefined();
    expect(result.data.warnings?.some(w => /unknown component/.test(w))).toBe(true);
  });

  it("keeps the first of duplicate evolves for a component, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: A 0.6\nevolve: a 0.7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components[0].evolveTo).toBe(0.6);
    expect(result.data.warnings?.some(w => /duplicate evolve/.test(w))).toBe(true);
  });

  it("skips an out-of-range evolve target with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: A 1.4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.components[0].evolveTo).toBeUndefined();
    expect(result.data.warnings?.some(w => /between 0 and 1/.test(w))).toBe(true);
  });

  it("skips an evolve with no target value, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: A");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings?.some(w => /evolve needs/.test(w))).toBe(true);
  });

  // ── pipeline ─────────────────────────────────────────────────────────────────

  it("parses a pipeline with sub-components onto its component (case-insensitive)", () => {
    const result = parseWardleyMap(
      "component: Database [0.4, 0.6]\npipeline: database [0.35, 0.75]\n  Self-hosted [0.45]\n  Managed DB [0.70]",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines).toHaveLength(1);
    expect(result.data.pipelines[0]).toMatchObject({
      component: "Database", // resolved to the declared casing
      x1: 0.35,
      x2: 0.75,
    });
    expect(result.data.pipelines[0].items).toEqual([
      { name: "Self-hosted", evolution: 0.45 },
      { name: "Managed DB", evolution: 0.70 },
    ]);
  });

  it("defaults pipelines to an empty array when none are declared", () => {
    const result = parseWardleyMap("component: A [0.5, 0.5]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines).toEqual([]);
  });

  it("strips a trailing // comment on pipeline header and item lines", () => {
    const result = parseWardleyMap(
      "component: DB [0.4, 0.6]\npipeline: DB [0.3, 0.8] // range\n  Managed [0.7] // buy",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines[0].items).toEqual([{ name: "Managed", evolution: 0.7 }]);
  });

  it("skips a pipeline to an unknown component with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\npipeline: Ghost [0.2, 0.8]\n  Sub [0.5]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines).toHaveLength(0);
    expect(result.data.warnings?.some(w => /unknown component/.test(w))).toBe(true);
  });

  it("keeps the first of duplicate pipelines for a component, with a warning", () => {
    const result = parseWardleyMap(
      "component: A [0.5,0.5]\npipeline: A [0.2, 0.8]\n  Sub [0.5]\npipeline: a [0.3, 0.7]\n  Sub2 [0.4]",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines).toHaveLength(1);
    expect(result.data.warnings?.some(w => /duplicate pipeline/.test(w))).toBe(true);
  });

  it("skips a pipeline with no valid sub-components, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\npipeline: A [0.2, 0.8]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines).toHaveLength(0);
    expect(result.data.warnings?.some(w => /no valid sub-components/.test(w))).toBe(true);
  });

  it("skips a pipeline whose range start is not less than the end, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\npipeline: A [0.8, 0.3]\n  Sub [0.5]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines).toHaveLength(0);
    expect(result.data.warnings?.some(w => /start must be less than end/.test(w))).toBe(true);
  });

  it("skips a sub-component outside the pipeline range, keeping the rest", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\npipeline: A [0.3, 0.6]\n  Good [0.5]\n  Bad [0.9]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines[0].items).toEqual([{ name: "Good", evolution: 0.5 }]);
    expect(result.data.warnings?.some(w => /outside the range/.test(w))).toBe(true);
  });

  it("skips a pipeline item missing its evolution bracket, with a warning", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\npipeline: A [0.3, 0.6]\n  Good [0.5]\n  Sub");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pipelines[0].items).toEqual([{ name: "Good", evolution: 0.5 }]);
    expect(result.data.warnings?.some(w => /\[evolution\]/.test(w))).toBe(true);
  });
});
