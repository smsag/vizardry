/**
 * styles.css for tests that pin stylesheet facts: what a DOM without layout
 * (happy-dom) cannot observe is asserted on the rules themselves.
 */
import { expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

/** The declarations of the first rule whose selector list is exactly `selector`. */
export function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, `a rule for ${selector} must exist`).not.toBeNull();
  return m![2];
}
