import type { CircleItem, CircleTier, CircleOfInfluenceResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const MIN_ITEMS = 2;
const MAX_PER_TIER = 8;
const TIERS: CircleTier[] = ["concern", "influence", "control"];

/**
 * Parses Circle of Influence & Concern syntax:
 *
 *   concern:   <thing you care about but can't act on>
 *   influence: <thing you can affect>
 *   control:   <thing entirely within your own doing>
 *
 * One item per line. The three keywords place the item in the outer (concern),
 * middle (influence), or inner (control) ring. `control:` is optional — omit it
 * and the canvas draws the classic two-ring Covey diagram.
 *
 * Parsing is graceful: an empty item, an over-full tier (beyond eight), or a
 * line that isn't one of the three keywords each skips with a warning. It is
 * only fatal when fewer than two items remain.
 */
export function parseCircleOfInfluence(source: string): CircleOfInfluenceResult {
  const lines = source.split("\n");
  const items: CircleItem[] = [];
  const counts: Record<CircleTier, number> = { concern: 0, influence: 0, control: 0 };
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;
    const lower = trimmed.toLowerCase();

    const tier = TIERS.find(t => lower.startsWith(`${t}:`));
    if (!tier) {
      warnings.push(`Line ${lineNum}: ignored — expected concern:, influence:, or control:`);
      continue;
    }

    const text = trimmed.slice(tier.length + 1).trim();
    if (!text) {
      warnings.push(`Line ${lineNum}: skipped empty ${tier} item`);
      continue;
    }
    if (counts[tier] >= MAX_PER_TIER) {
      warnings.push(`Line ${lineNum}: skipped "${text}" — the ${tier} ring already has ${MAX_PER_TIER} items`);
      continue;
    }

    counts[tier]++;
    items.push({ tier, text });
  }

  if (items.length < MIN_ITEMS) {
    return { ok: false, error: `A Circle of Influence needs at least ${MIN_ITEMS} items, e.g. concern: The economy` };
  }

  return { ok: true, data: { items, warnings: warnings.length > 0 ? warnings : undefined } };
}
