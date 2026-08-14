import type { Result } from "./types/core";
import type { CompassData, CompassInsight } from "./types/compass";

/**
 * Parses the Product Compass source. Flat top-level `keyword: value` lines,
 * order preserved within each keyword; the renderer groups them into the four
 * fixed sections. Every field is optional and most are repeatable, so the brief
 * can start tiny and grow. Links on `problem:` / `idea:` lines are stripped
 * upstream by `extractInlineLinks` (the `linked` pipeline) and resolved at
 * render time, so the parser only sees the plain label text.
 *
 *   type: compass
 *   title: Personalized Onboarding
 *   forces: New users abandon setup halfway (JTBD push)
 *   problem: New shops can't reach first value fast enough
 *   insight: 40% | of new shops abandon setup
 *   northstar: 50% of new shops activate within day one
 *   idea: Guided setup wizard
 *   gtm: Roll out to new signups first
 *   pricing: Included in all tiers
 */

/** Canonical section key for a raw keyword (spaces/hyphens ignored). */
export function canonKey(raw: string): string | null {
  const k = raw.toLowerCase().replace(/[\s_-]+/g, "");
  switch (k) {
    case "force": case "forces": return "forces";
    case "problem": case "problemstatement": return "problem";
    case "insight": case "insights": case "case": return "insight";
    case "northstar": return "northstar";
    case "idea": case "ideas": case "solution": case "solutions": return "idea";
    case "gtm": case "gotomarket": return "gtm";
    case "pricing": case "price": return "pricing";
    default: return null;
  }
}

/** Splits an insight value on the first `|` into figure + text. */
function parseInsight(value: string): CompassInsight {
  const bar = value.indexOf("|");
  if (bar === -1) return { figure: "", text: value.trim() };
  return { figure: value.slice(0, bar).trim(), text: value.slice(bar + 1).trim() };
}

export function parseCompass(source: string): Result<CompassData> {
  const data: CompassData = {
    forces: [], problem: [], insights: [], northStar: "",
    ideas: [], gtm: [], pricing: [], warnings: [],
  };

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.search(/\S/) !== 0) continue; // top-level lines only
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      data.warnings.push(`Line ${i + 1}: "${trimmed}" is not a "key: value" line — ignored`);
      continue;
    }
    const rawKey = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    const lower = rawKey.toLowerCase();
    if (lower === "title" || lower === "collapsed") continue; // handled by the canvas chrome
    if (!value) continue;

    const key = canonKey(rawKey);
    switch (key) {
      case "forces": data.forces.push(value); break;
      case "problem": data.problem.push(value); break;
      case "insight": data.insights.push(parseInsight(value)); break;
      case "northstar": if (!data.northStar) data.northStar = value; break;
      case "idea": data.ideas.push(value); break;
      case "gtm": data.gtm.push(value); break;
      case "pricing": data.pricing.push(value); break;
      default:
        data.warnings.push(`Line ${i + 1}: unknown field "${rawKey}" — ignored`);
    }
  }

  return { ok: true, data };
}
