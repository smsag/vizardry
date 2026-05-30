import { moment } from "obsidian";
import { en } from "./locales/en";
import type { TranslationKey } from "./locales/en";
import { de } from "./locales/de";

type LocaleMap = Partial<Record<TranslationKey, string>>;

const LOCALES: Record<string, LocaleMap> = { de };

// Resolved once on first call and reused for the lifetime of the session.
// moment.locale() does not change while Obsidian is running, so this is safe.
// Call resetLocaleCache() in tests that exercise different locales.
let _resolvedLocale: LocaleMap | null = null;

function resolvedLocale(): LocaleMap {
  if (_resolvedLocale === null) {
    const lang = moment.locale().slice(0, 2);
    _resolvedLocale = LOCALES[lang] ?? {};
  }
  return _resolvedLocale;
}

/** @internal For tests only — clears the cached locale so a different language can be exercised. */
export function resetLocaleCache(): void {
  _resolvedLocale = null;
}

/**
 * Translate a key to the current Obsidian UI language, falling back to English.
 * Supports {{varName}} interpolation via the optional `vars` argument.
 *
 * @example
 *   t("controls.downloadPng")
 *   t("nav.jumpTo", { heading: "Strategy" })
 *   t("nav.goToImage", { n: 3 })
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const locale = resolvedLocale();
  let str = (locale[key] ?? en[key]) as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{{${k}}}`, String(v));
    }
  }
  return str;
}

/**
 * Convenience helper for framework description lookups.
 * Derives the translation key from the framework id automatically.
 * Returns an empty string (rather than "undefined") if the id has no locale entry.
 */
export function tFrameworkDescription(id: string): string {
  const key = `framework.${id}.description`;
  if (!(key in en)) return "";
  return t(key as TranslationKey);
}

export type { TranslationKey };
