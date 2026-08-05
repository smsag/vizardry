import { describe, it, expect } from "vitest";
import { parsePeriod } from "./period-edit";

describe("parsePeriod", () => {
  it("extracts the period value from source", () => {
    expect(parsePeriod("title: Future Self\nperiod: May – Jul 2025\nblock: As-Is")).toBe("May – Jul 2025");
  });

  it("is case-insensitive on the keyword and trims the value", () => {
    expect(parsePeriod("PERIOD:   Q3 2025  ")).toBe("Q3 2025");
  });

  it("returns empty string when no period line is present", () => {
    expect(parsePeriod("title: Future Self\nblock: As-Is")).toBe("");
  });
});
