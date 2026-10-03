import type { Result } from "./types/core";
import {
  type ProContraData,
  type ProContraOption,
  type ProContraSide,
  PRO_CONTRA_MAX_WEIGHT,
} from "./types/procontra";

/**
 * Parses the Pro / Contra source. Every line is a `key: value` line;
 * indentation is cosmetic — `pro:`/`con:` attach to the most recent
 * `option:`, and those before any `option:` form an implicit, unnamed option
 * (the plain T-chart). A trailing `| n` sets an argument's weight (1–3,
 * default 1). Recoverable issues degrade to warning chips.
 *
 *   type: procontra
 *   title: Relocate the team?
 *   question: Should we move the core team to Berlin by Q2?
 *   option: Move to Berlin
 *     pro: Larger hiring pool | 3
 *     con: Relocation cost | 2
 *   option: Stay remote
 *     pro: No disruption | 2
 *   decision: Move to Berlin
 */

/** One classified source line. `line` is the index into the scanned lines. */
export type ProContraLine =
  | { kind: "option"; line: number; name: string }
  | { kind: "arg"; line: number; side: ProContraSide; text: string; weight: number; clamped: boolean }
  | { kind: "question" | "decision"; line: number; value: string }
  | { kind: "invalid"; line: number; message: string };

/** Keys the canvas chrome or the dispatcher handle — not ours to warn about. */
const CHROME_KEYS = new Set(["type", "title", "collapsed"]);

const SIDE_KEYS: Record<string, ProContraSide> = { pro: "pro", con: "con", contra: "con" };

/** Splits `text | n` into text and a clamped 1..MAX weight. A tail that isn't
 *  an integer is part of the text (arguments may contain a `|`). */
export function splitWeight(value: string): { text: string; weight: number; clamped: boolean } {
  const bar = value.lastIndexOf("|");
  if (bar !== -1) {
    const tail = value.slice(bar + 1).trim();
    if (/^-?\d+$/.test(tail)) {
      const n = Number(tail);
      const weight = Math.max(1, Math.min(PRO_CONTRA_MAX_WEIGHT, n));
      return { text: value.slice(0, bar).trim(), weight, clamped: weight !== n };
    }
  }
  return { text: value.trim(), weight: 1, clamped: false };
}

/**
 * Classifies each line. Shared by the parser and the source write-back, so both
 * agree on which line is the Nth argument / Nth option.
 */
export function scanProContraLines(lines: string[]): ProContraLine[] {
  const out: ProContraLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      out.push({ kind: "invalid", line: i, message: `"${trimmed}" is not a "key: value" line — ignored` });
      continue;
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (CHROME_KEYS.has(key)) continue;

    if (key === "question" || key === "decision") {
      out.push({ kind: key, line: i, value });
    } else if (key === "option") {
      if (value) out.push({ kind: "option", line: i, name: value });
      else out.push({ kind: "invalid", line: i, message: `"option:" has no name — ignored` });
    } else if (key in SIDE_KEYS) {
      const { text, weight, clamped } = splitWeight(value);
      if (text) out.push({ kind: "arg", line: i, side: SIDE_KEYS[key], text, weight, clamped });
      else out.push({ kind: "invalid", line: i, message: `"${key}:" has no text — ignored` });
    } else {
      out.push({ kind: "invalid", line: i, message: `unknown field "${key}" — ignored` });
    }
  }
  return out;
}

export function parseProContra(source: string): Result<ProContraData> {
  let question = "";
  let decision = "";
  const options: ProContraOption[] = [];
  const warnings: string[] = [];
  let current: ProContraOption | null = null;
  let argRef = 0;
  let optionRef = 0;

  for (const entry of scanProContraLines(source.split("\n"))) {
    const where = `Line ${entry.line + 1}`;
    switch (entry.kind) {
      case "question": question = entry.value; break;
      case "decision": decision = entry.value; break;
      case "invalid": warnings.push(`${where}: ${entry.message}`); break;
      case "option":
        current = { name: entry.name, ref: optionRef++, pros: [], cons: [] };
        options.push(current);
        break;
      case "arg": {
        if (!current) {
          current = { name: "", ref: -1, pros: [], cons: [] };
          options.push(current);
        }
        if (entry.clamped) warnings.push(`${where}: weight must be 1–${PRO_CONTRA_MAX_WEIGHT} — clamped to ${entry.weight}`);
        const arg = { side: entry.side, text: entry.text, weight: entry.weight, ref: argRef++ };
        (entry.side === "pro" ? current.pros : current.cons).push(arg);
        break;
      }
    }
  }

  return { ok: true, data: { question, decision, options, warnings } };
}
