import type { Result } from "./types/core";
import {
  type TestCardData,
  type TestCardStep,
  TEST_CARD_STEPS,
  TEST_CARD_MAX_LEVEL,
} from "./types/testcard";

/**
 * Parses the Test Card source. The card's structure is fixed (see
 * `TEST_CARD_STEPS`); the source only supplies each step's text, each gauge's
 * 1–3 level, and a `deadline:`. Everything is a top-level `key: value` line;
 * order is ignored. Unknown top-level keys degrade to a warning (like the grid
 * canvases) rather than failing the whole card.
 *
 *   type: testcard
 *   title: Pricing test
 *   deadline: 2026-09-01
 *   hypothesis: SMBs will pay $49/mo for the pro tier
 *   critical: 3
 *   test: Run a two-week paywall A/B test
 *   cost: 2
 *   reliability: 2
 *   metric: Paid conversion among trials
 *   time: 1
 *   criteria: Conversion exceeds 5%
 */

/** Every source keyword the card understands (besides title/collapsed/comments). */
const TEXT_KEYS = new Set(TEST_CARD_STEPS.map(s => s.key));
const GAUGE_KEYS = new Set(TEST_CARD_STEPS.flatMap(s => s.gauges.map(g => g.key)));

/** Clamps a gauge value to 0..MAX; returns null when it isn't a number. */
function parseLevel(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(TEST_CARD_MAX_LEVEL, Math.round(n)));
}

export function parseTestCard(source: string): Result<TestCardData> {
  const text = new Map<string, string>();
  const levels = new Map<string, number>();
  let deadline = "";
  const warnings: string[] = [];

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.search(/\S/) !== 0) continue; // top-level lines only (indent = structure elsewhere)
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      warnings.push(`Line ${i + 1}: "${trimmed}" is not a "key: value" line — ignored`);
      continue;
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();

    if (key === "title" || key === "collapsed") continue; // handled by the canvas chrome
    if (key === "deadline") { deadline = value; continue; }

    if (TEXT_KEYS.has(key)) {
      text.set(key, value);
    } else if (GAUGE_KEYS.has(key)) {
      const lvl = parseLevel(value);
      if (lvl === null) warnings.push(`Line ${i + 1}: "${key}" must be a number 0–${TEST_CARD_MAX_LEVEL} — ignored`);
      else levels.set(key, lvl);
    } else {
      warnings.push(`Line ${i + 1}: unknown field "${key}" — ignored`);
    }
  }

  const steps: TestCardStep[] = TEST_CARD_STEPS.map(def => ({
    key: def.key,
    eyebrow: def.eyebrow,
    prompt: def.prompt,
    text: text.get(def.key) ?? "",
    gauges: def.gauges.map(g => ({ key: g.key, label: g.label, level: levels.get(g.key) ?? 0 })),
  }));

  return { ok: true, data: { deadline, steps, warnings } };
}
