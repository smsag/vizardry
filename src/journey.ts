import type { JourneyCard, JourneyLaneKey, JourneyPhase, JourneyResult, JourneyVariant } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

export interface JourneyLaneConfig {
  key: JourneyLaneKey;
  label: string;
  blueprintOnly: boolean;
}

/** Fixed canonical lane order. Blueprint-only lanes are appended after the
 *  five journey lanes rather than inserted under Actions — a simpler layout
 *  that avoids reordering the journey lanes between variants. */
export const JOURNEY_LANE_CONFIG: JourneyLaneConfig[] = [
  { key: "action",      label: "Actions",             blueprintOnly: false },
  { key: "touchpoint",  label: "Touchpoints",         blueprintOnly: false },
  { key: "feeling",     label: "Thoughts & Feelings", blueprintOnly: false },
  { key: "painpoint",   label: "Pain Points",         blueprintOnly: false },
  { key: "opportunity", label: "Opportunities",       blueprintOnly: false },
  { key: "frontstage",  label: "Frontstage Actions",  blueprintOnly: true  },
  { key: "backstage",   label: "Backstage Actions",   blueprintOnly: true  },
  { key: "support",     label: "Support Processes",   blueprintOnly: true  },
];

const LANE_KEYS = JOURNEY_LANE_CONFIG.map(l => l.key);

/** Divider row rendered directly above the named lane, blueprint variant only. */
export const JOURNEY_DIVIDERS: Partial<Record<JourneyLaneKey, string>> = {
  frontstage: "Line of Interaction",
  backstage:  "Line of Visibility",
  support:    "Line of Internal Interaction",
};

/** Lanes to render for a given variant, in display order. */
export function lanesForVariant(variant: JourneyVariant): JourneyLaneConfig[] {
  return JOURNEY_LANE_CONFIG.filter(l => !l.blueprintOnly || variant === "blueprint");
}

function resolveJourneyVariant(value: string): JourneyVariant | null {
  const v = value.trim().toLowerCase();
  if (v === "journey" || v === "blueprint") return v;
  return null;
}

/**
 * Parses Journey Map / Service Blueprint source — one shared syntax feeding
 * two views (see the doc comment on `JourneyData` in types.ts).
 *
 *   persona: Returning online shopper
 *   scenario: Reordering a subscription item after a failed auto-renewal
 *
 *   phase: Awareness
 *     action: Receives renewal-failed email
 *     touchpoint: Email notification
 *     feeling: Confused | Didn't expect the renewal to fail
 *     painpoint: Unclear why the renewal failed
 *     opportunity: Add a one-tap "retry payment" link in the email
 *     frontstage: Support chatbot greets user if they open live chat
 *     backstage: Billing service logs the failed charge
 *     support: Payment gateway webhook retry queue
 *
 * All eight lane keywords are parsed unconditionally regardless of variant —
 * whether frontstage:/backstage:/support: lines are actually rendered is a
 * render-time concern (see renderer/journey.ts), not a parse-time one, so
 * expanding/collapsing the canvas never loses data.
 *
 * `typeOverride`, when provided by the vizardry dispatcher (e.g. "blueprint"
 * from "type: journey, blueprint"), selects the variant; otherwise defaults
 * to "journey" — so a plain "type: journey" behaves exactly as it always has.
 */
export function parseJourney(source: string, typeOverride?: string): JourneyResult {
  const warnings: string[] = [];
  let variant: JourneyVariant = "journey";
  if (typeOverride !== undefined) {
    const resolved = resolveJourneyVariant(typeOverride);
    if (resolved) {
      variant = resolved;
    } else {
      // Recoverable: an unknown variant falls back to the base journey view.
      warnings.push(`Unknown variant "${typeOverride.trim().toLowerCase()}" — using "journey"`);
    }
  }

  const lines = source.split("\n");

  let persona = "";
  let scenario = "";
  const phases: JourneyPhase[] = [];
  const phaseRegistry = new Map<string, JourneyPhase>();

  let currentPhase: JourneyPhase | null = null;
  let laneIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      currentPhase = null;
      laneIndent = -1;

      const lower = trimmed.toLowerCase();
      if (lower.startsWith("persona:")) {
        persona = trimmed.slice("persona:".length).trim();
      } else if (lower.startsWith("scenario:")) {
        scenario = trimmed.slice("scenario:".length).trim();
      } else if (lower.startsWith("phase:")) {
        const name = trimmed.slice("phase:".length).trim();
        if (!name) {
          // Recoverable: keep the column with a placeholder name.
          warnings.push(`Line ${i + 1}: phase has no name — showing an empty phase`);
        }
        const key = name.toLowerCase().trim();
        if (name && phaseRegistry.has(key)) {
          // Recoverable: merge subsequent lanes into the first phase of this name.
          warnings.push(`Line ${i + 1}: phase "${name}" is defined more than once — merged`);
          currentPhase = phaseRegistry.get(key)!;
        } else {
          currentPhase = { name, lanes: {} };
          if (key) phaseRegistry.set(key, currentPhase);
          phases.push(currentPhase);
        }
      } else {
        warnings.push(`Line ${i + 1}: unexpected line "${trimmed}" — skipped`);
      }
      continue;
    }

    // Indented line — must be inside a phase
    if (!currentPhase) {
      warnings.push(`Line ${i + 1}: indented content outside a phase — skipped`);
      continue;
    }

    if (laneIndent === -1) laneIndent = indent;
    if (indent !== laneIndent) {
      warnings.push(`Line ${i + 1}: unexpected indentation — skipped`);
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      warnings.push(`Line ${i + 1}: expected "key: value", got "${trimmed}" — skipped`);
      continue;
    }

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase() as JourneyLaneKey;
    if (!LANE_KEYS.includes(key)) {
      warnings.push(`Line ${i + 1}: unknown lane keyword "${key}" — skipped`);
      continue;
    }

    const rest = trimmed.slice(colonIdx + 1).trim();
    const pipeIdx = rest.indexOf("|");
    const name = pipeIdx === -1 ? rest : rest.slice(0, pipeIdx).trim();
    if (!name) { warnings.push(`Line ${i + 1}: ${key} has no text — skipped`); continue; }
    const subtitle = pipeIdx === -1 ? "" : rest.slice(pipeIdx + 1).trim();

    const card: JourneyCard = { name, subtitle };
    (currentPhase.lanes[key] ??= []).push(card);
  }

  if (phases.length === 0) {
    return { ok: false, error: 'At least one "phase:" is required' };
  }

  return { ok: true, data: { variant, persona, scenario, phases, warnings: warnings.length ? warnings : undefined } };
}
