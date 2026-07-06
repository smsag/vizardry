import { describe, it, expect } from "vitest";
import { parsePaceLayers } from "./pacelayers";

describe("parsePaceLayers", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("defaults to type shearing when no type: line is present", () => {
    const result = parsePaceLayers("layer: Fashion\n  note: Some signal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("shearing");
  });

  it("parses type: product", () => {
    const result = parsePaceLayers("type: product\nlayer: Fashion\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("product");
  });

  it("parses type: retro", () => {
    const result = parsePaceLayers("type: retro\nlayer: Fashion\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("retro");
  });

  it("parses context: line", () => {
    const result = parsePaceLayers("context: Q2 review\ntype: shearing");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.context).toBe("Q2 review");
  });

  it("parses a layer with note:", () => {
    const result = parsePaceLayers("layer: Fashion\n  note: Fast signal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Fashion"]?.note).toBe("Fast signal");
  });

  it("parses a layer with obs, feed, and idea", () => {
    const src = [
      "layer: Infrastructure",
      "  obs: What we observe",
      "  feed: Feedback signal",
      "  idea: Action idea",
    ].join("\n");
    const result = parsePaceLayers(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cell = result.data.layers["Infrastructure"];
    expect(cell?.obs).toBe("What we observe");
    expect(cell?.feed).toBe("Feedback signal");
    expect(cell?.idea).toBe("Action idea");
  });

  it("appends continuation lines to the previous sub-key", () => {
    const src = [
      "layer: Governance",
      "  obs: First line",
      "  continued here",
    ].join("\n");
    const result = parsePaceLayers(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Governance"]?.obs).toContain("First line");
    expect(result.data.layers["Governance"]?.obs).toContain("continued here");
  });

  it("parses all six canonical layer names", () => {
    const layerNames = ["Fashion", "Commerce", "Infrastructure", "Governance", "Culture", "Nature"];
    const src = layerNames.map(n => `layer: ${n}\n  note: x`).join("\n");
    const result = parsePaceLayers(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const name of layerNames) {
      expect(result.data.layers[name as keyof typeof result.data.layers]).toBeDefined();
    }
  });

  it("returns ok with empty layers for an empty source", () => {
    const result = parsePaceLayers("");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.layers)).toHaveLength(0);
  });

  it("strips inline // comments from layer content lines", () => {
    const result = parsePaceLayers("layer: Fashion\n  note: Signal // ignore this");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Fashion"]?.note).not.toContain("ignore this");
    expect(result.data.layers["Fashion"]?.note?.trim()).toBe("Signal");
  });

  it("ignores blank lines without resetting the current layer", () => {
    const src = "layer: Fashion\n\n  note: Still Fashion";
    const result = parsePaceLayers(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Fashion"]?.note).toBe("Still Fashion");
  });

  // ── Lenient / graceful paths ───────────────────────────────────────────────

  it("falls back to shearing for unknown type (no error)", () => {
    const result = parsePaceLayers("type: unknown");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("shearing");
  });

  it("silently skips unknown layer names (no error)", () => {
    const result = parsePaceLayers("layer: Quantum\n  note: X\nlayer: Fashion\n  note: Y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Fashion"]?.note).toBe("Y");
    expect((result.data.layers as Record<string, unknown>)["Quantum"]).toBeUndefined();
  });

  it("ignores content indented under an unknown layer", () => {
    const result = parsePaceLayers("layer: Ghost\n  obs: Should be dropped\nlayer: Nature\n  note: Kept");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Nature"]?.note).toBe("Kept");
  });

  // ── Type-specific display name as a layer: alias ──────────────────────────

  it("accepts the current type's display name as an alias for the canonical layer", () => {
    const result = parsePaceLayers("type: product\nlayer: Experiments\n  note: Shipping fast");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Fashion"]?.note).toBe("Shipping fast");
  });

  it("does not resolve another type's display name as an alias", () => {
    // "Experiments" is only a valid alias under type: product, not shearing.
    const result = parsePaceLayers("type: shearing\nlayer: Experiments\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.layers)).toHaveLength(0);
  });

  it("resolves a layer: alias even when it appears before the type: line", () => {
    const result = parsePaceLayers("layer: Experiments\n  note: Shipping fast\ntype: product");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("product");
    expect(result.data.layers["Fashion"]?.note).toBe("Shipping fast");
  });

  it("alias matching is case-insensitive", () => {
    const result = parsePaceLayers("type: retro\nlayer: actions\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layers["Fashion"]?.note).toBe("X");
  });

  // ── Compound "type: pacelayers, <variant>" (canvas now lives under the
  // generic ```vizardry fence, so the type: line self-identifies) ──────────

  it("accepts the compound 'type: pacelayers, <variant>' form", () => {
    const result = parsePaceLayers("type: pacelayers, product\nlayer: Fashion\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("product");
  });

  it("still accepts the plain 'type: <variant>' form (no id prefix)", () => {
    const result = parsePaceLayers("type: product\nlayer: Fashion\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("product");
  });

  it("compound form is case-insensitive on both the id and the variant", () => {
    const result = parsePaceLayers("type: PaceLayers, Retro\nlayer: Fashion\n  note: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("retro");
  });

  it("falls back to shearing when the compound form's variant is unknown", () => {
    const result = parsePaceLayers("type: pacelayers, nonsense");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("shearing");
  });
});
