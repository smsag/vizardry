import { describe, it, expect } from "vitest";
import { CATALOG_ID_LISTS, CUSTOM_RENDERERS_BY_ID, FRAMEWORKS_BY_ID, getInsertOptions, findDuplicateIds } from "./catalog";

const INSERT_OPTIONS = getInsertOptions();
import { extractType } from "./vizardry-dispatch";

describe("findDuplicateIds", () => {
  it("reports an id claimed by two different lists", () => {
    expect(findDuplicateIds([["a", "b"], ["b", "c"]])).toEqual(["b"]);
  });

  it("reports an id repeated inside one list", () => {
    expect(findDuplicateIds([["a", "a"]])).toEqual(["a"]);
  });

  it("reports each duplicate once", () => {
    expect(findDuplicateIds([["a"], ["a"], ["a"]])).toEqual(["a"]);
  });

  it("is empty when every id is unique", () => {
    expect(findDuplicateIds([["a", "b"], ["c"]])).toEqual([]);
  });
});

describe("the canvas catalog", () => {
  it("has no id claimed twice across grid frameworks, custom renderers and presets", () => {
    // Ids are a single namespace: `type:` resolution reads two of the maps and
    // main.ts registers one `insert-<id>` command per entry. A collision makes
    // one renderer silently unreachable and hands Obsidian a duplicate command.
    expect(findDuplicateIds(CATALOG_ID_LISTS)).toEqual([]);
  });

  it("offers one insert option per catalog id", () => {
    const ids = CATALOG_ID_LISTS.flat();
    expect(INSERT_OPTIONS.map(o => o.id)).toEqual(ids);
  });

  it("gives every insert option a label and a non-empty template", () => {
    for (const option of INSERT_OPTIONS) {
      expect(option.label, option.id).toBeTruthy();
      expect(option.template, option.id).toContain("```vizardry");
      expect(option.template, option.id).toMatch(/^type:/m);
    }
  });

  it("seeds every insert option with a template whose type: resolves to a renderer", () => {
    // A template naming an unregistered type renders as `Unknown type "…"` the
    // moment it is inserted.
    for (const option of INSERT_OPTIONS) {
      const found = extractType(option.template);
      expect(found, option.id).not.toBeNull();
      const id = found!.id;
      expect(
        Boolean(FRAMEWORKS_BY_ID[id] || CUSTOM_RENDERERS_BY_ID[id]),
        `${option.id} → type: ${id}`,
      ).toBe(true);
    }
  });

  it("gives every entry a distinct template", () => {
    // Two entries seeding byte-identical content are two commands doing the
    // same thing under different names — which is what "Matrix" and
    // "Impact / Effort Matrix" used to be.
    const byTemplate = new Map<string, string>();
    for (const option of INSERT_OPTIONS) {
      const clash = byTemplate.get(option.template);
      expect(clash, `${option.id} duplicates ${clash}`).toBeUndefined();
      byTemplate.set(option.template, option.id);
    }
  });

  it("covers every documented matrix preset", () => {
    const ids = INSERT_OPTIONS.map(o => o.id);
    for (const preset of ["pain-matrix", "opportunity-matrix", "impact-matrix", "assumption-matrix", "scenario-matrix"]) {
      expect(ids, preset).toContain(preset);
    }
  });
});
