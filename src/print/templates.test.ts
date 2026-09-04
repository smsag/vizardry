import { describe, it, expect } from "vitest";
import { DEFAULT_PRINT_OPTIONS } from "./options";
import {
  BUILTIN_PRINT_TEMPLATES,
  getPrintTemplate,
  resolveTemplateVars,
} from "./templates";

describe("BUILTIN_PRINT_TEMPLATES", () => {
  it("all have unique ids and a full variable set", () => {
    const ids = BUILTIN_PRINT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of BUILTIN_PRINT_TEMPLATES) {
      for (const key of ["font", "headingFont", "monoFont", "fontSize", "lineHeight", "color", "headingColor", "accent", "measure"] as const) {
        expect(t.vars[key], `${t.id}.${key}`).toBeTruthy();
      }
    }
  });
});

describe("getPrintTemplate", () => {
  it("returns the requested template", () => {
    expect(getPrintTemplate("technical").id).toBe("technical");
  });

  it("falls back to the first built-in for an unknown id", () => {
    expect(getPrintTemplate("nope")).toBe(BUILTIN_PRINT_TEMPLATES[0]);
  });
});

describe("resolveTemplateVars", () => {
  it("applies an accent override from templateValues", () => {
    const t = getPrintTemplate("manuscript");
    const vars = resolveTemplateVars(t, {
      ...DEFAULT_PRINT_OPTIONS,
      templateValues: { accent: "#123456" },
    });
    expect(vars.accent).toBe("#123456");
    // untouched vars survive
    expect(vars.font).toBe(t.vars.font);
  });

  it("ignores a blank override and keeps the template default", () => {
    const t = getPrintTemplate("manuscript");
    const vars = resolveTemplateVars(t, {
      ...DEFAULT_PRINT_OPTIONS,
      templateValues: { accent: "   " },
    });
    expect(vars.accent).toBe(t.vars.accent);
  });
});
