import type { StrategyCanvasData, StrategyFactor, StrategyCanvasResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

export const STRATEGY_MIN_SCORE = 0;
export const STRATEGY_MAX_SCORE = 10;
const MIN_FACTORS = 2;
const MAX_FACTORS = 16;
const MAX_SERIES = 6;

/**
 * Parses Strategy Canvas (Blue Ocean) syntax:
 *
 *   series: Us | Legacy Carrier | Low-cost Rival
 *   factor: Price   | 8 | 3 | 9
 *   factor: Meals   | 2 | 8 | 2
 *
 * `series:` (optional, one line) declares the ordered value-curve names,
 * pipe-separated — mirroring Wardley's `stages:`. Each `factor:` line names a
 * competing factor, then one pipe-separated score (0–10) per series in the same
 * order — mirroring a matrix axis line (`x: Title | a | b`).
 *
 * If `series:` is omitted, the number of curves is inferred from the first
 * valid factor and they are auto-labelled "Series 1", "Series 2", …
 *
 * Parsing is graceful (matching radar/wheeloflife/…): a blank/duplicate factor,
 * a non-numeric score, or an unrecognised line each skip with a warning; scores
 * outside 0–10 are clamped; extra scores past the series count are dropped and a
 * missing score becomes a gap. It is only fatal when fewer than two factors, or
 * no series, remain — a value curve needs at least a line.
 */
export function parseStrategyCanvas(source: string): StrategyCanvasResult {
  const lines = source.split("\n");
  const warnings: string[] = [];

  let series: string[] | null = null;
  let seriesLine = -1;
  const factors: StrategyFactor[] = [];
  const seen = new Map<string, number>();
  let capped = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("series:")) {
      const names = trimmed.slice("series:".length).split("|").map(s => s.trim()).filter(s => s !== "");
      if (series !== null) {
        warnings.push(`Line ${lineNum}: duplicate "series:" ignored (the one on line ${seriesLine} wins)`);
        continue;
      }
      if (names.length === 0) {
        warnings.push(`Line ${lineNum}: "series:" has no names — ignored`);
        continue;
      }
      if (names.length > MAX_SERIES) {
        warnings.push(`Only the first ${MAX_SERIES} series are shown — the chart caps at ${MAX_SERIES}.`);
      }
      series = names.slice(0, MAX_SERIES);
      seriesLine = lineNum;
      continue;
    }

    if (!lower.startsWith("factor:")) {
      warnings.push(`Line ${lineNum}: ignored — expected a "factor:" line, e.g. factor: Price | 8 | 3`);
      continue;
    }

    const rest = trimmed.slice("factor:".length);
    const parts = rest.split("|");
    const label = parts[0].trim();
    const rawScores = parts.slice(1).map(s => s.trim());

    if (!label) {
      warnings.push(`Line ${lineNum}: skipped — factor is missing a name`);
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`Line ${lineNum}: skipped duplicate factor "${label}" (already on line ${seen.get(key)})`);
      continue;
    }
    if (rawScores.length === 0 || rawScores.every(s => s === "")) {
      warnings.push(`Line ${lineNum}: skipped "${label}" — no scores (0–10) given`);
      continue;
    }

    if (factors.length >= MAX_FACTORS) {
      if (!capped) {
        warnings.push(`Only the first ${MAX_FACTORS} factors are shown — the chart caps at ${MAX_FACTORS}.`);
        capped = true;
      }
      continue;
    }

    const scores = rawScores.map((raw, s) => {
      if (raw === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        warnings.push(`Line ${lineNum}: "${label}" score ${s + 1} ("${raw}") is not a number — treated as a gap`);
        return null;
      }
      if (n < STRATEGY_MIN_SCORE || n > STRATEGY_MAX_SCORE) {
        const clamped = Math.min(STRATEGY_MAX_SCORE, Math.max(STRATEGY_MIN_SCORE, n));
        warnings.push(`Line ${lineNum}: "${label}" score ${n} clamped to ${clamped} (0–10 range)`);
        return clamped;
      }
      return n;
    });

    seen.set(key, lineNum);
    factors.push({ label, scores });
  }

  if (factors.length < MIN_FACTORS) {
    return { ok: false, error: `A strategy canvas needs at least ${MIN_FACTORS} factors, e.g. factor: Price | 8 | 3` };
  }

  // Resolve series: an explicit `series:` line, or inferred from the widest
  // factor row when omitted.
  const widest = factors.reduce((m, f) => Math.max(m, f.scores.length), 0);
  let resolved: string[];
  if (series !== null) {
    resolved = series;
  } else {
    const count = Math.min(widest, MAX_SERIES) || 1;
    resolved = Array.from({ length: count }, (_, i) => `Series ${i + 1}`);
  }

  // Normalise every factor's score row to exactly `resolved.length` entries:
  // pad short rows with gaps, drop (and warn once about) any overflow.
  const n = resolved.length;
  let overflow = false;
  for (const f of factors) {
    if (f.scores.length > n && !overflow) {
      warnings.push(`Some factors list more scores than there are series (${n}) — extra scores were dropped.`);
      overflow = true;
    }
    if (f.scores.length > n) f.scores.length = n;
    while (f.scores.length < n) f.scores.push(null);
  }

  const data: StrategyCanvasData = {
    series: resolved,
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
  return { ok: true, data };
}
