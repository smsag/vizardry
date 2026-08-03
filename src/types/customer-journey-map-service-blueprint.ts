import type { Result } from "./core";

// ── Customer Journey Map / Service Blueprint ────────────────────────────────
// One canvas, two variants over the same phase/lane data (see the doc comment
// on SIPOCData above for the precedent this follows). frontstage:/backstage:/
// support: lines are parsed unconditionally regardless of variant — they sit
// inert in journey view and resurface the moment the block's `type:` line is
// hand-edited from "journey" to "journey, blueprint" (there is no in-canvas
// button for this — switching variant is a source edit only, exactly like
// SIPOC's `type: sipoc` / `type: sipoc, flow`), and owner/metric sit inert in
// table view and resurface in flow view.

export type JourneyVariant = "journey" | "blueprint";

export type JourneyLaneKey =
  | "action" | "touchpoint" | "feeling" | "painpoint" | "opportunity"
  | "frontstage" | "backstage" | "support";

export interface JourneyCard {
  name: string;
  subtitle: string;
}

export interface JourneyPhase {
  name: string;
  lanes: Partial<Record<JourneyLaneKey, JourneyCard[]>>;
}

export interface JourneyData {
  variant: JourneyVariant;
  persona: string;
  scenario: string;
  phases: JourneyPhase[];
  /** Non-fatal parse warnings (skipped lines, merged duplicate phases).
   *  Surfaced as a small canvas warning chip. */
  warnings?: string[];
}

export type JourneyResult = Result<JourneyData>;
