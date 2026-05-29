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
    const src = `# this is a map\nanchor: User\n\ncomponent: DB [0.2, 0.8] # a database`;
    const result = parseWardleyMap(src);
    expect(result.ok).toBe(true);
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
    const result = parseWardleyMap("# just a comment");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("No components") });
  });
});
