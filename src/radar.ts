import type { RadarAxis, RadarResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const MIN_AXES = 3;
const MAX_AXES = 12;
export const RADAR_MIN_SCORE = 0;
export const RADAR_MAX_SCORE = 10;

/**
 * Parses Radar / Spider chart syntax:
 *
 *   axis: <statement> | <score>
 *
 * One axis per line; the statement is the spoke label, the score (0–10) its
 * distance from the centre. Axes are drawn evenly around the circle in source
 * order and the scores are connected into a filled polygon.
 *
 * Parsing is graceful: a blank statement, a duplicate, a missing/non-numeric
 * score, or a line that isn't an `axis:` each skips with a warning; scores
 * outside 0–10 are clamped; the chart caps at 12 axes. It is only fatal when
 * fewer than three axes remain — a radar needs at least a triangle.
 */
export function parseRadar(source: string): RadarResult {
  const lines = source.split("\n");
  const axes: RadarAxis[] = [];
  const seen = new Map<string, number>();
  const warnings: string[] = [];
  let capped = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;

    if (!trimmed.toLowerCase().startsWith("axis:")) {
      warnings.push(`Line ${lineNum}: ignored — expected an "axis:" line, e.g. axis: We plan for change | 6`);
      continue;
    }

    const rest = trimmed.slice("axis:".length).trim();
    const bar = rest.lastIndexOf("|");
    const label = (bar === -1 ? rest : rest.slice(0, bar)).trim();
    const scoreRaw = bar === -1 ? "" : rest.slice(bar + 1).trim();

    if (!label) {
      warnings.push(`Line ${lineNum}: skipped — axis is missing a statement`);
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`Line ${lineNum}: skipped duplicate axis "${label}" (already on line ${seen.get(key)})`);
      continue;
    }
    if (scoreRaw === "") {
      warnings.push(`Line ${lineNum}: skipped "${label}" — missing a score (0–10)`);
      continue;
    }
    const score = Number(scoreRaw);
    if (!Number.isFinite(score)) {
      warnings.push(`Line ${lineNum}: skipped "${label}" — "${scoreRaw}" is not a number`);
      continue;
    }
    let clamped = score;
    if (score < RADAR_MIN_SCORE || score > RADAR_MAX_SCORE) {
      clamped = Math.min(RADAR_MAX_SCORE, Math.max(RADAR_MIN_SCORE, score));
      warnings.push(`Line ${lineNum}: "${label}" score ${score} clamped to ${clamped} (0–10 range)`);
    }

    if (axes.length >= MAX_AXES) {
      if (!capped) {
        warnings.push(`Only the first ${MAX_AXES} axes are shown — the chart caps at ${MAX_AXES}.`);
        capped = true;
      }
      continue;
    }

    seen.set(key, lineNum);
    axes.push({ label, score: clamped });
  }

  if (axes.length < MIN_AXES) {
    return { ok: false, error: `A radar chart needs at least ${MIN_AXES} axes, e.g. axis: We plan for change | 6` };
  }

  return { ok: true, data: { axes, warnings: warnings.length > 0 ? warnings : undefined } };
}
