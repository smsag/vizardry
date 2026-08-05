import type { WholePersonDimension, WholePersonEntry, WholePersonResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

export const WP_MIN_SCORE = 0;
export const WP_MAX_SCORE = 10;
const MAX_ACTIVITIES = 5;

/** Canonical dimension order — the wheel and cards always render these four. */
export const WHOLE_PERSON_DIMENSIONS: WholePersonDimension[] = ["body", "mind", "heart", "spirit"];

/**
 * Parses Whole Person / Four Dimensions syntax:
 *
 *   body:   <0-10> | <activity> | <activity> …
 *   mind:   <0-10> | <activity>
 *   heart:  <0-10>
 *   spirit: <0-10> | <activity>
 *
 * The four fixed keywords are the dimensions (Body/Mind/Heart/Spirit); each
 * carries a 0–10 score and optional renewal activities. Any dimension may be
 * omitted (it renders at 0 with no activities).
 *
 * Parsing is graceful: a missing/non-numeric score, a duplicate dimension, or
 * an unrecognised keyword each skips with a warning; out-of-range scores are
 * clamped to 0–10. It is only fatal when no dimension is given at all.
 */
export function parseWholePerson(source: string): WholePersonResult {
  const lines = source.split("\n");
  const provided = new Map<WholePersonDimension, WholePersonEntry>();
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;
    const lower = trimmed.toLowerCase();

    const dim = WHOLE_PERSON_DIMENSIONS.find(d => lower.startsWith(`${d}:`));
    if (!dim) {
      warnings.push(`Line ${lineNum}: ignored — expected body:, mind:, heart:, or spirit:`);
      continue;
    }
    if (provided.has(dim)) {
      warnings.push(`Line ${lineNum}: skipped duplicate "${dim}" dimension`);
      continue;
    }

    const rest = trimmed.slice(dim.length + 1).trim();
    const parts = rest.split("|").map(p => p.trim());
    const scoreRaw = parts[0] ?? "";
    if (scoreRaw === "") {
      warnings.push(`Line ${lineNum}: skipped "${dim}" — missing a score (0–10)`);
      continue;
    }
    const score = Number(scoreRaw);
    if (!Number.isFinite(score)) {
      warnings.push(`Line ${lineNum}: skipped "${dim}" — "${scoreRaw}" is not a number`);
      continue;
    }
    let clamped = score;
    if (score < WP_MIN_SCORE || score > WP_MAX_SCORE) {
      clamped = Math.min(WP_MAX_SCORE, Math.max(WP_MIN_SCORE, score));
      warnings.push(`Line ${lineNum}: "${dim}" score ${score} clamped to ${clamped} (0–10 range)`);
    }

    let activities = parts.slice(1).filter(a => a.length > 0);
    if (activities.length > MAX_ACTIVITIES) {
      warnings.push(`Line ${lineNum}: "${dim}" has more than ${MAX_ACTIVITIES} activities — extra ones dropped`);
      activities = activities.slice(0, MAX_ACTIVITIES);
    }

    provided.set(dim, { dimension: dim, score: clamped, activities });
  }

  if (provided.size === 0) {
    return { ok: false, error: "A Whole Person canvas needs at least one dimension, e.g. body: 6 | Run 3× a week" };
  }

  // Always emit all four in canonical order; unmentioned dimensions default to 0.
  const entries: WholePersonEntry[] = WHOLE_PERSON_DIMENSIONS.map(
    d => provided.get(d) ?? { dimension: d, score: 0, activities: [] },
  );

  return { ok: true, data: { entries, warnings: warnings.length > 0 ? warnings : undefined } };
}
