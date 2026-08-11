import type { OdysseyGauge, OdysseyMilestone, OdysseyPlan, OdysseyResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const MIN_PLANS = 2;
const MAX_PLANS = 4;
export const GAUGE_MIN = 0;
export const GAUGE_MAX = 10;
const MAX_GAUGES = 6;
const MAX_MILESTONES = 8;
const MAX_QUESTIONS = 8;

const PLAN_LETTERS = ["A", "B", "C", "D"];
const YEAR_RE = /^year\s*(\d+)\s*:\s*(.*)$/i;

/**
 * Parses Odyssey of Life syntax:
 *
 *   plan: <Label> | <Title>
 *     archetype: <one-line descriptor>
 *     year <N>: <milestone>
 *     gauge: <Name> | <0-10>
 *     question: <text>
 *
 * A `plan:` line opens a plan; the `archetype`/`year`/`gauge`/`question` lines
 * that follow attach to it (indentation is cosmetic — the keyword decides).
 * `<Label>` is optional: `plan: The Steady Climb` auto-letters to A/B/C/D by
 * position.
 *
 * Parsing is graceful — recoverable problems degrade to a warning and skip the
 * offending line rather than failing the whole canvas:
 *   - a keyword line that appears before any `plan:` (or after the plan cap)
 *   - a gauge with a blank name or missing/non-numeric value
 *   - a `year` with no text
 *   - a plan beyond the fourth (the canvas caps at four)
 *   - per-plan overflow of gauges/milestones/questions
 * Out-of-range gauge values are clamped into 0–10. It is only fatal when fewer
 * than two usable plans remain — the whole point is to compare alternatives.
 */
export function parseOdyssey(source: string): OdysseyResult {
  const lines = source.split("\n");
  const plans: OdysseyPlan[] = [];
  const warnings: string[] = [];
  let current: OdysseyPlan | null = null;
  let capped = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("plan:")) {
      current = null;
      if (plans.length >= MAX_PLANS) {
        if (!capped) {
          warnings.push(`Only the first ${MAX_PLANS} plans are shown — the canvas caps at ${MAX_PLANS}.`);
          capped = true;
        }
        continue;
      }
      const rest = trimmed.slice("plan:".length).trim();
      const bar = rest.indexOf("|");
      let label = bar === -1 ? "" : rest.slice(0, bar).trim();
      const title = (bar === -1 ? rest : rest.slice(bar + 1)).trim();
      if (!label && !title) {
        warnings.push(`Line ${lineNum}: skipped — plan needs a title, e.g. plan: A | The Steady Climb`);
        continue;
      }
      if (!label) label = PLAN_LETTERS[plans.length] ?? String(plans.length + 1);
      current = { label, title, milestones: [], gauges: [], questions: [] };
      plans.push(current);
      continue;
    }

    if (current === null) {
      warnings.push(`Line ${lineNum}: ignored — "${trimmed}" is not inside a plan block`);
      continue;
    }

    if (lower.startsWith("archetype:")) {
      current.archetype = trimmed.slice("archetype:".length).trim() || undefined;
      continue;
    }

    const ym = trimmed.match(YEAR_RE);
    if (ym) {
      const year = parseInt(ym[1], 10);
      const text = ym[2].trim();
      if (!text) {
        warnings.push(`Line ${lineNum}: skipped year ${year} — no milestone text`);
        continue;
      }
      if (current.milestones.length >= MAX_MILESTONES) {
        warnings.push(`Line ${lineNum}: skipped year ${year} — "${current.title}" already has ${MAX_MILESTONES} milestones`);
        continue;
      }
      const milestone: OdysseyMilestone = { year, text };
      current.milestones.push(milestone);
      continue;
    }

    if (lower.startsWith("gauge:")) {
      const rest = trimmed.slice("gauge:".length).trim();
      const bar = rest.indexOf("|");
      const name = (bar === -1 ? rest : rest.slice(0, bar)).trim();
      const valueRaw = bar === -1 ? "" : rest.slice(bar + 1).trim();
      if (!name) {
        warnings.push(`Line ${lineNum}: skipped gauge — missing a name`);
        continue;
      }
      if (valueRaw === "") {
        warnings.push(`Line ${lineNum}: skipped gauge "${name}" — missing a value (0–10)`);
        continue;
      }
      const value = Number(valueRaw);
      if (!Number.isFinite(value)) {
        warnings.push(`Line ${lineNum}: skipped gauge "${name}" — "${valueRaw}" is not a number`);
        continue;
      }
      let clamped = value;
      if (value < GAUGE_MIN || value > GAUGE_MAX) {
        clamped = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, value));
        warnings.push(`Line ${lineNum}: gauge "${name}" value ${value} clamped to ${clamped} (0–10 range)`);
      }
      if (current.gauges.length >= MAX_GAUGES) {
        warnings.push(`Line ${lineNum}: skipped gauge "${name}" — "${current.title}" already has ${MAX_GAUGES} gauges`);
        continue;
      }
      const gauge: OdysseyGauge = { name, value: clamped };
      current.gauges.push(gauge);
      continue;
    }

    if (lower.startsWith("question:")) {
      const text = trimmed.slice("question:".length).trim();
      if (!text) {
        warnings.push(`Line ${lineNum}: skipped empty question`);
        continue;
      }
      if (current.questions.length >= MAX_QUESTIONS) {
        warnings.push(`Line ${lineNum}: skipped question — "${current.title}" already has ${MAX_QUESTIONS}`);
        continue;
      }
      current.questions.push(text);
      continue;
    }

    warnings.push(`Line ${lineNum}: ignored — unrecognised keyword in "${trimmed}"`);
  }

  if (plans.length < MIN_PLANS) {
    return { ok: false, error: `An Odyssey plan needs at least ${MIN_PLANS} life plans, e.g. plan: A | The Steady Climb` };
  }

  // Milestones render top-to-bottom by year regardless of source order.
  // Multiple activities may share a year; the stable sort keeps their source
  // order within that year.
  for (const plan of plans) plan.milestones.sort((a, b) => a.year - b.year);

  return { ok: true, data: { plans, warnings: warnings.length > 0 ? warnings : undefined } };
}
