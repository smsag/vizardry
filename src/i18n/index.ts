import { moment } from "obsidian";
import { en } from "./locales/en";
import type { TranslationKey } from "./locales/en";
import { de } from "./locales/de";

type LocaleMap = Partial<Record<TranslationKey, string>>;

const LOCALES: Record<string, LocaleMap> = { de };

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
  const lang = moment.locale().slice(0, 2);
  const locale = LOCALES[lang] ?? {};
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
 * Falls back to English if the id has no entry in the current locale.
 */
export function tFrameworkDescription(id: string): string {
  return t(`framework.${id}.description` as TranslationKey);
}

export type { TranslationKey };
