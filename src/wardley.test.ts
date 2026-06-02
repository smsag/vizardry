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
});
