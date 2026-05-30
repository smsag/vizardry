import { describe, it, expect } from "vitest";
import { parseCarouselBlock } from "./carousel";

describe("parseCarouselBlock", () => {
  it("parses two images with alt text", () => {
    const result = parseCarouselBlock("![Slide 1](a.png)\n![Slide 2](b.png)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images).toHaveLength(2);
    expect(result.data.images[0]).toEqual({ src: "a.png", alt: "Slide 1" });
    expect(result.data.images[1]).toEqual({ src: "b.png", alt: "Slide 2" });
  });

  it("parses images with empty alt text", () => {
    const result = parseCarouselBlock("![](one.png)\n![](two.png)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images[0].alt).toBe("");
  });

  it("ignores blank lines", () => {
    const result = parseCarouselBlock("\n![](a.png)\n\n![](b.png)\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images).toHaveLength(2);
  });

  it("ignores comment lines", () => {
    const result = parseCarouselBlock("# intro\n![](a.png)\n![](b.png)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images).toHaveLength(2);
  });

  it("trims whitespace from src and alt", () => {
    const result = parseCarouselBlock("![ Slide ]( path/img.png )\n![](b.png)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images[0].src).toBe("path/img.png");
    expect(result.data.images[0].alt).toBe("Slide");
  });

  it("parses paths with spaces and special chars", () => {
    const result = parseCarouselBlock("![](my folder/image file.png)\n![](b.png)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images[0].src).toBe("my folder/image file.png");
  });

  it("returns error for fewer than 2 images", () => {
    const result = parseCarouselBlock("![](only-one.png)");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("at least 2") });
  });

  it("returns error for empty source", () => {
    const result = parseCarouselBlock("");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("at least 2") });
  });

  it("returns error for non-image line", () => {
    const result = parseCarouselBlock("![](a.png)\nnot an image\n![](b.png)");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Line 2') });
  });

  it("returns error for missing parentheses (bare text)", () => {
    const result = parseCarouselBlock("just text\n![](b.png)");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Line 1') });
  });

  it("accepts more than 2 images", () => {
    const src = ["a", "b", "c", "d"].map(n => `![](${n}.png)`).join("\n");
    const result = parseCarouselBlock(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.images).toHaveLength(4);
  });
});
