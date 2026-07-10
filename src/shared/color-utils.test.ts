// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { bestTextColor } from "./color-utils";

function mockComputedStyle(value: string): void {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({ backgroundColor: value } as CSSStyleDeclaration);
}

afterEach(() => vi.restoreAllMocks());

// Note: a dark background and an *unparseable* background both resolve to
// "#ffffff" (the fallback), so only a LIGHT background's expected
// "var(--text-normal)" result can actually prove the string was parsed
// correctly rather than silently falling back.

describe("bestTextColor", () => {
  it("picks white text on a dark legacy-syntax rgb() background", () => {
    mockComputedStyle("rgb(20, 20, 20)");
    expect(bestTextColor(document.createElement("div"))).toBe("#ffffff");
  });

  it("picks normal text on a light legacy-syntax rgb() background", () => {
    mockComputedStyle("rgb(240, 240, 240)");
    expect(bestTextColor(document.createElement("div"))).toBe("var(--text-normal)");
  });

  it("parses a light legacy rgba() with an alpha channel, not just rgb()", () => {
    mockComputedStyle("rgba(240, 240, 240, 1)");
    expect(bestTextColor(document.createElement("div"))).toBe("var(--text-normal)");
  });

  it("parses CSS Color 4 space syntax rgb(r g b), as used by recent Chromium for color-mix() results", () => {
    mockComputedStyle("rgb(240 240 240)");
    expect(bestTextColor(document.createElement("div"))).toBe("var(--text-normal)");
  });

  it("parses CSS Color 4 space syntax with an alpha channel, rgb(r g b / a)", () => {
    mockComputedStyle("rgb(240 240 240 / 1)");
    expect(bestTextColor(document.createElement("div"))).toBe("var(--text-normal)");
  });

  it("parses CSS Color 4 syntax with a percentage alpha channel", () => {
    mockComputedStyle("rgba(240 240 240 / 100%)");
    expect(bestTextColor(document.createElement("div"))).toBe("var(--text-normal)");
  });

  it("falls back to white when the computed colour cannot be parsed at all", () => {
    mockComputedStyle("color-mix(in srgb, red 50%, blue)"); // unresolved in this environment
    expect(bestTextColor(document.createElement("div"))).toBe("#ffffff");
  });
});
