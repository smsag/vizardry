import { describe, expect, it } from "vitest";
import { ADKAR } from "./frameworks/adkar";

describe("ADKAR framework definition", () => {
  it("defines the expected five ADKAR blocks", () => {
    expect(ADKAR.blocks.map(block => block.label)).toEqual([
      "Awareness",
      "Desire",
      "Knowledge",
      "Ability",
      "Reinforcement",
    ]);
  });

  it("uses unique area identifiers and references all of them in the template", () => {
    const areas = ADKAR.blocks.map(block => block.area);
    const uniqueAreas = new Set(areas);
    const templateAreas = (ADKAR.gridTemplate.match(/[a-z]+/g) ?? []).filter(token => token.length === 2);

    expect(uniqueAreas.size).toBe(areas.length);
    expect(new Set(templateAreas)).toEqual(uniqueAreas);
  });
});