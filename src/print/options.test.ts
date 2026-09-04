import { describe, it, expect } from "vitest";
import { DEFAULT_PRINT_OPTIONS, normalizePrintOptions } from "./options";

describe("normalizePrintOptions", () => {
  it("returns the defaults when nothing is persisted", () => {
    expect(normalizePrintOptions(undefined)).toEqual(DEFAULT_PRINT_OPTIONS);
  });

  it("fills in keys missing from older saved settings", () => {
    const merged = normalizePrintOptions({ pageNumbers: "n-of-total" });
    expect(merged.pageNumbers).toBe("n-of-total");
    expect(merged.templateId).toBe(DEFAULT_PRINT_OPTIONS.templateId);
    expect(merged.margins).toBe(DEFAULT_PRINT_OPTIONS.margins);
  });

  it("clones templateValues rather than sharing the reference", () => {
    const source = { templateValues: { accent: "#fff" } };
    const merged = normalizePrintOptions(source);
    merged.templateValues.accent = "#000";
    expect(source.templateValues.accent).toBe("#fff");
  });
});
