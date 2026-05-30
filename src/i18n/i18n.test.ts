import { describe, it, expect } from "vitest";
import { en } from "./locales/en";
import { de } from "./locales/de";

/**
 * Validates that all non-framework translation keys in the English base locale
 * are present in every supported locale. Framework description keys are exempt
 * because they are optional (shown only in the insert modal) and fall back
 * to English gracefully.
 *
 * Add new locales here as they are created.
 */
describe("i18n locale completeness", () => {
  const requiredKeys = (Object.keys(en) as (keyof typeof en)[]).filter(
    k => !k.startsWith("framework.")
  );

  it("German (de) contains all required keys", () => {
    const missing = requiredKeys.filter(k => !(k in de));
    expect(missing, `Missing German translations: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("no locale has keys that don't exist in English base", () => {
    const extraDe = (Object.keys(de) as string[]).filter(k => !(k in en));
    expect(extraDe, `de.ts has unknown keys: ${extraDe.join(", ")}`).toHaveLength(0);
  });
});
