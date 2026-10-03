/**
 * Types for the Pro / Contra canvas (`type: procontra`) — a weighted pros-and-
 * cons list for a decision ("moral algebra"). One or more options, each with
 * pro and contra arguments weighted 1–3; the canvas sums each side into a net
 * score, and an optional `decision:` records what was chosen.
 *
 * With no `option:` line, the top-level `pro:`/`con:` lines form a single
 * implicit option — the classic two-column T-chart.
 */

export type ProContraSide = "pro" | "con";

export interface ProContraArgument {
  side: ProContraSide;
  text: string;
  /** 1..PRO_CONTRA_MAX_WEIGHT */
  weight: number;
  /** Ordinal among every accepted argument line of the block — the handle the
   *  write-back uses to find this argument's source line again. */
  ref: number;
}

export interface ProContraOption {
  /** Authored name; "" for the implicit option (arguments before any `option:`). */
  name: string;
  /** Ordinal among the `option:` lines, or -1 for the implicit option. */
  ref: number;
  pros: ProContraArgument[];
  cons: ProContraArgument[];
}

export interface ProContraData {
  question: string;
  decision: string;
  options: ProContraOption[];
  warnings: string[];
}

/** Heaviest weight an argument can carry (the item shows this many dots). */
export const PRO_CONTRA_MAX_WEIGHT = 3;

/** Sum of an option's pro weights minus its contra weights. */
export function proContraTotals(option: ProContraOption): { pro: number; con: number; net: number } {
  const pro = option.pros.reduce((s, a) => s + a.weight, 0);
  const con = option.cons.reduce((s, a) => s + a.weight, 0);
  return { pro, con, net: pro - con };
}
