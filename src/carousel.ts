import type { CarouselBlock, CarouselImage, CarouselResult } from "./types";

// Accepts standard Markdown image syntax, one image per line.
// Blank lines and lines starting with // are ignored.
// Any line that is not a Markdown image returns a parse error.
//
// Syntax:
//   ![Alt text](path/to/image.png)
//   ![](path/to/other.png)

export function parseCarouselBlock(source: string): CarouselResult {
  const lines = source.split("\n");
  const images: CarouselImage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("collapsed:")) continue;

    const match = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (!match) {
      return {
        ok: false,
        error: `Line ${i + 1}: expected Markdown image syntax "![alt](path)" — got "${trimmed}"`,
      };
    }
    const alt = match[1].trim();
    const src = match[2].trim();
    if (!src) {
      return { ok: false, error: `Line ${i + 1}: image path cannot be empty` };
    }
    images.push({ src, alt });
  }

  if (images.length < 2) {
    return { ok: false, error: "A carousel requires at least 2 images" };
  }

  return { ok: true, data: { images } };
}
