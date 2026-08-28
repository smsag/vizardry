import type { FishboneResult, FishboneCategory, FishboneCause } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

/**
 * Canonical category presets, selected by the `type:` variant
 * (`type: fishbone, 6m`). A preset seeds its category "bones" up front, so the
 * scaffold appears even before the user fills them; `category:` lines then merge
 * into a matching preset bone (by name) or append a new one.
 */
const PRESETS: Record<string, string[]> = {
  // The classic manufacturing 6 Ms (People = Manpower, Environment = Mother Nature).
  "6m": ["People", "Method", "Machine", "Material", "Measurement", "Environment"],
  manufacturing: ["People", "Method", "Machine", "Material", "Measurement", "Environment"],
  // The service 4 Ss.
  service: ["Surroundings", "Suppliers", "Systems", "Skills"],
  "4s": ["Surroundings", "Suppliers", "Systems", "Skills"],
  // The marketing 7 Ps.
  marketing: ["Product", "Price", "Place", "Promotion", "People", "Process", "Physical Evidence"],
  "7p": ["Product", "Price", "Place", "Promotion", "People", "Process", "Physical Evidence"],
  "7ps": ["Product", "Price", "Place", "Promotion", "People", "Process", "Physical Evidence"],
};

/**
 * Parses a Fishbone (Ishikawa) diagram source block.
 *
 *   effect: Users abandon cart due to slow checkout
 *   category: Technology
 *     cause: API latency
 *       subcause: Unoptimized queries
 *   category: Process
 *     cause: Too many steps
 *
 * Keywords: `effect:` (the fish-head, required, one), `category:` (a major
 * bone), `cause:` (under a category), `subcause:` (under a cause). An optional
 * `type:` variant selects a category preset (`6m`, `service`, `marketing`).
 *
 * Parsing is graceful (matching radar/problem/…): an orphan cause/subcause, an
 * unrecognised line, or a duplicate effect each skip with a warning chip rather
 * than failing the whole canvas. Indentation is treated as cosmetic — nesting
 * follows the keyword, not the column. It is only fatal when no `effect:` is
 * given: a fishbone needs its head.
 */
export function parseFishbone(source: string, variant?: string): FishboneResult {
  const lines = source.split("\n");
  const warnings: string[] = [];

  let effect = "";
  const categories: FishboneCategory[] = [];
  const byName = new Map<string, FishboneCategory>();
  let currentCategory: FishboneCategory | null = null;
  let currentCause: FishboneCause | null = null;

  const addCategory = (name: string): FishboneCategory => {
    const cat: FishboneCategory = { name, causes: [] };
    categories.push(cat);
    byName.set(name.toLowerCase(), cat);
    return cat;
  };

  // Seed preset bones (if any). An unknown variant warns and falls back to a
  // blank diagram rather than failing.
  if (variant) {
    const preset = PRESETS[variant];
    if (preset) preset.forEach(addCategory);
    else warnings.push(`Unknown fishbone preset "${variant}" — ignored. Try 6m, service, or marketing.`);
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(trimmed)) continue;
    const lineNum = i + 1;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("effect:")) {
      const value = trimmed.slice("effect:".length).trim();
      if (effect) {
        warnings.push(`Line ${lineNum}: duplicate "effect:" ignored — the first one wins`);
        continue;
      }
      effect = value;
    } else if (lower.startsWith("category:")) {
      const name = trimmed.slice("category:".length).trim();
      if (!name) {
        warnings.push(`Line ${lineNum}: "category:" has no name — skipped`);
        continue;
      }
      // Merge into a preset bone of the same name, otherwise append.
      currentCategory = byName.get(name.toLowerCase()) ?? addCategory(name);
      currentCause = null;
    } else if (lower.startsWith("cause:")) {
      const name = trimmed.slice("cause:".length).trim();
      if (!currentCategory) {
        warnings.push(`Line ${lineNum}: "cause: ${name}" has no parent category — skipped`);
        continue;
      }
      currentCause = { name, subcauses: [] };
      currentCategory.causes.push(currentCause);
    } else if (lower.startsWith("subcause:")) {
      const name = trimmed.slice("subcause:".length).trim();
      if (!currentCause) {
        warnings.push(`Line ${lineNum}: "subcause: ${name}" has no parent cause — skipped`);
        continue;
      }
      currentCause.subcauses.push({ name });
    } else {
      warnings.push(`Line ${lineNum}: ignored — expected effect/category/cause/subcause: "${trimmed}"`);
    }
  }

  if (!effect) {
    return { ok: false, error: 'Missing required "effect:" field — e.g. effect: Users abandon checkout' };
  }

  return { ok: true, data: { effect, categories, warnings: warnings.length > 0 ? warnings : undefined } };
}
