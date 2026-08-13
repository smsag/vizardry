/**
 * Types for the Test Card canvas (`type: testcard`) — a single fixed-template
 * card for planning one experiment: a hypothesis, the test that checks it, the
 * metric it moves, and the success criteria, each with an optional 1–3 rating
 * gauge (how critical, how costly, how reliable, how long).
 *
 * The four steps, their prompts, and which gauges hang off each are a fixed
 * template (never authored) supplied by `TEST_CARD_STEPS`; the source only
 * fills in each step's text and gauge levels, plus a title and a deadline.
 */

/** One 1–3 rating gauge (0 = unset). `key` is the source keyword. */
export interface TestCardGaugeDef {
  key: string;    // source keyword, e.g. "critical"
  label: string;  // shown next to the gauge, e.g. "Critical"
}

/** A step of the card: its prompt prefix, the source keyword that fills it in,
 *  and the gauges shown under it. Part of the fixed template. */
export interface TestCardStepDef {
  key: string;      // source keyword for the fill-in, e.g. "hypothesis"
  eyebrow: string;  // e.g. "Step 1 · Hypothesis"
  prompt: string;   // bold prefix, e.g. "We believe that"
  gauges: TestCardGaugeDef[];
}

/** Parsed gauge value: the def plus the chosen level (0 = unset, 1–3). */
export interface TestCardGauge {
  key: string;
  label: string;
  level: number;
}

/** Parsed step: the def's prompt/eyebrow plus the authored text and gauges. */
export interface TestCardStep {
  key: string;
  eyebrow: string;
  prompt: string;
  text: string;
  gauges: TestCardGauge[];
}

export interface TestCardData {
  deadline: string;
  steps: TestCardStep[];
  warnings: string[];
}

/** Highest gauge level (the gauge shows this many dots). */
export const TEST_CARD_MAX_LEVEL = 3;

/**
 * The fixed template: four steps with the Strategyzer Test Card prompts, and
 * the rating gauges that hang off each. Not authored — the source only fills in
 * the text and levels.
 */
export const TEST_CARD_STEPS: TestCardStepDef[] = [
  {
    key: "hypothesis", eyebrow: "Step 1 · Hypothesis", prompt: "We believe that",
    gauges: [{ key: "critical", label: "Critical" }],
  },
  {
    key: "test", eyebrow: "Step 2 · Test", prompt: "To verify that, we will",
    gauges: [{ key: "cost", label: "Test cost" }, { key: "reliability", label: "Data reliability" }],
  },
  {
    key: "metric", eyebrow: "Step 3 · Metric", prompt: "And measure",
    gauges: [{ key: "time", label: "Time required" }],
  },
  {
    key: "criteria", eyebrow: "Step 4 · Criteria", prompt: "We are right if",
    gauges: [],
  },
];
