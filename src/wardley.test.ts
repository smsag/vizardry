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

  it("returns error when positioned stages are not strictly increasing", () => {
    const src = `stages:\n  0.4: Product\n  0.2: Custom\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("strictly increasing") });
  });

  it("returns error when positioned stages include duplicates", () => {
    const src = `stages:\n  0.4: Product\n  0.4: Commodity\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("duplicate stages position") });
  });

  it("returns error when positioned stages use out-of-range values", () => {
    const src = `stages:\n  1.2: Commodity\n  0.8: Product\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("between 0 and 1") });
  });

  it("returns error when positioned stages include 0 endpoint", () => {
    const src = `stages:\n  0: Driver\n  0.5: Contributor\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("exclusive") });
  });

  it("returns error when positioned stages include 1 endpoint", () => {
    const src = `stages:\n  0.4: Product\n  1: Commodity\ncomponent: API [0.5, 0.5]`;
    const result = parseWardleyMap(src);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("exclusive") });
  });

  it("returns error when stages has empty labels", () => {
    const result = parseWardleyMap("stages: Driver |  | Informed\ncomponent: API [0.5, 0.5]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("empty label") });
  });

  it("returns error when stages has fewer than two labels", () => {
    const result = parseWardleyMap("stages: Driver\ncomponent: API [0.5, 0.5]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("at least two labels") });
  });

  it("returns error for component missing coordinates", () => {
    const result = parseWardleyMap("component: NoBrackets");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("coordinates") });
  });

  it("returns error for coordinates out of range", () => {
    const result = parseWardleyMap("component: X [1.5, 0.5]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("between 0 and 1") });
  });

  it("returns error for link with missing arrow", () => {
    const result = parseWardleyMap("component: A [0.5, 0.5]\nlink: A to B");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("->") });
  });

  it("returns error for link referencing unknown component", () => {
    const result = parseWardleyMap("component: A [0.5, 0.5]\nlink: A -> Ghost");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Ghost") });
  });

  it("returns error for unknown keyword", () => {
    const result = parseWardleyMap("movement: A -> B");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("unrecognised keyword") });
  });

  it("returns error when no components defined", () => {
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

  it("errors on a duplicate component name", () => {
    const result = parseWardleyMap("component: Auth [0.5,0.5]\ncomponent: Auth [0.2,0.2]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("duplicate component") });
  });

  it("errors on a case-insensitive duplicate component name", () => {
    const result = parseWardleyMap("component: Auth [0.5,0.5]\ncomponent: auth [0.2,0.2]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("duplicate component") });
  });

  // ── Links: case-insensitive resolution, self-links, duplicates ──────────────

  it("resolves link endpoints case-insensitively to the declared name", () => {
    const result = parseWardleyMap("component: Web App [0.8,0.4]\ncomponent: DB [0.3,0.6]\nlink: web app -> db");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "Web App", to: "DB" }]);
  });

  it("errors on a self-link", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nlink: A -> a");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("itself") });
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

  it("errors when evolve references an unknown component", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: Ghost 0.8");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("unknown component") });
  });

  it("errors on a duplicate evolve for the same component", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: A 0.6\nevolve: a 0.7");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Duplicate evolve") });
  });

  it("errors when evolve target is out of range", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: A 1.4");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("between 0 and 1") });
  });

  it("errors when evolve has no target value", () => {
    const result = parseWardleyMap("component: A [0.5,0.5]\nevolve: A");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("evolve requires") });
  });
});
