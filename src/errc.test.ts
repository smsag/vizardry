import { describe, expect, it } from "vitest";
import { ERRC } from "./frameworks/errc";

describe("ERRC framework definition", () => {
  it("defines the four ERRC actions", () => {
    expect(ERRC.blocks.map(block => block.label)).toEqual([
      "Eliminate",
      "Raise",
      "Reduce",
      "Create",
    ]);
  });

  it("uses unique area identifiers and references all of them in the template", () => {
    const areas = ERRC.blocks.map(block => block.area);
    const uniqueAreas = new Set(areas);
    const templateAreas = (ERRC.gridTemplate.match(/[a-z]+/g) ?? []).filter(token => token.length === 2);

    expect(uniqueAreas.size).toBe(areas.length);
    expect(new Set(templateAreas)).toEqual(uniqueAreas);
  });
});
