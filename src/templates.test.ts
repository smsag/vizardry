import { describe, it, expect } from "vitest";
import { WARDLEY_TEMPLATE } from "./templates";

describe("WARDLEY_TEMPLATE", () => {
  it("uses the standard Wardley stages by default", () => {
    expect(WARDLEY_TEMPLATE).toContain("stages: Genesis | Custom | Product | Commodity");
    expect(WARDLEY_TEMPLATE).not.toContain("Driver | Approver | Contributor | Informed");
  });
});
