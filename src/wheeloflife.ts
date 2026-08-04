import type { WheelOfLifeArea, WheelOfLifeResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const MIN_AREAS = 2;
const MAX_AREAS = 12;
export const WHEEL_MIN_SCORE = 0;
export const WHEEL_MAX_SCORE = 10;

/**
 * Parses Wheel of Life syntax:
 *
 *   area: <Name> | <score>
 *   area: <Name> | <score> | <optional note>
 *
 * where `<score>` is a number in the 0–10 range (the wedge fills from the
 * centre out to that level). One `area:` line per life area; the wheel is
 * divided into equal wedges in source order.
 *
 * Parsing is graceful: recoverable problems degrade to a warning and skip the
 * offending line rather than failing the whole canvas. A line is only fatal
 * when fewer than two usable areas remain — a wheel needs at least two wedges.
 * Concretely, these each emit a warning and are skipped or adjusted:
 *   - a line that isn't an `area:` declaration
 *   - an area with a blank name, or a duplicate of an earlier area
 *   - an area with a missing or non-numeric score
 *   - a score outside 0–10 (clamped into range)
 *   - areas beyond the twelfth (the wheel caps at twelve wedges)
 */
export function parseWheelOfLife(source: string): WheelOfLifeResult {
  const lines = source.split("\n");
  const areas: WheelOfLifeArea[] = [];
  const seen = new Map<string, number>();
  const warnings: string[] = [];
  let capped = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;

    if (!trimmed.toLowerCase().startsWith("area:")) {
      warnings.push(`Line ${lineNum}: ignored — expected an "area:" line, e.g. area: Career | 7`);
      continue;
    }

    // Split on the first two "|" only, so a note may itself contain "|".
    const rest = trimmed.slice("area:".length).trim();
    const firstBar = rest.indexOf("|");
    const name = (firstBar === -1 ? rest : rest.slice(0, firstBar)).trim();
    const afterName = firstBar === -1 ? "" : rest.slice(firstBar + 1);
    const secondBar = afterName.indexOf("|");
    const scoreRaw = (secondBar === -1 ? afterName : afterName.slice(0, secondBar)).trim();
    const note = secondBar === -1 ? "" : afterName.slice(secondBar + 1).trim();

    if (!name) {
      warnings.push(`Line ${lineNum}: skipped — area is missing a name`);
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`Line ${lineNum}: skipped duplicate area "${name}" (already declared on line ${seen.get(key)})`);
      continue;
    }

    if (scoreRaw === "") {
      warnings.push(`Line ${lineNum}: skipped "${name}" — missing a score (0–10), e.g. area: ${name} | 7`);
      continue;
    }
    const score = Number(scoreRaw);
    if (!Number.isFinite(score)) {
      warnings.push(`Line ${lineNum}: skipped "${name}" — "${scoreRaw}" is not a number`);
      continue;
    }

    let clamped = score;
    if (score < WHEEL_MIN_SCORE || score > WHEEL_MAX_SCORE) {
      clamped = Math.min(WHEEL_MAX_SCORE, Math.max(WHEEL_MIN_SCORE, score));
      warnings.push(`Line ${lineNum}: "${name}" score ${score} clamped to ${clamped} (0–10 range)`);
    }

    if (areas.length >= MAX_AREAS) {
      if (!capped) {
        warnings.push(`Only the first ${MAX_AREAS} areas are shown — the wheel caps at ${MAX_AREAS} wedges.`);
        capped = true;
      }
      continue;
    }

    seen.set(key, lineNum);
    areas.push({ name, score: clamped, note: note || undefined });
  }

  if (areas.length < MIN_AREAS) {
    return { ok: false, error: `A Wheel of Life needs at least ${MIN_AREAS} areas, e.g. area: Career | 7` };
  }

  return { ok: true, data: { areas, warnings: warnings.length > 0 ? warnings : undefined } };
}
