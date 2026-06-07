import type { FishboneResult, FishboneCategory, FishboneCause } from "./types";

/**
 * Parses a Fishbone (Ishikawa) diagram source block.
 *
 * Format (keyword-based, up to four levels):
 *   effect: Users abandon cart due to slow checkout
 *
 *   category: Technology
 *     cause: API latency
 *       subcause: Unoptimized queries
 *     cause: Frontend rendering
 *
 *   category: Process
 *     cause: Too many steps
 *
 * Keywords:
 *   effect    — the problem/effect at the fish-head (required, one)
 *   category  — a major bone / cause category (at root indent)
 *   cause     — a cause under a category (indented)
 *   subcause  — a sub-cause under a cause (doubly indented)
 *   title:    — optional canvas title (skipped by parser)
 */
export function parseFishbone(source: string): FishboneResult {
  const lines = source.split("\n");
  let effect = "";
  const categories: FishboneCategory[] = [];
  let currentCategory: FishboneCategory | null = null;
  let currentCause: FishboneCause | null = null;
  let categoryIndent = -1;
  let causeIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("title:")) continue;

    const indent = raw.search(/\S/);
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("effect:")) {
      if (indent !== 0) return { ok: false, error: `Line ${i + 1}: "effect:" must be at root level` };
      effect = trimmed.slice("effect:".length).trim();
    } else if (lower.startsWith("category:")) {
      if (indent !== 0) return { ok: false, error: `Line ${i + 1}: "category:" must be at root level` };
      currentCategory = { name: trimmed.slice("category:".length).trim(), causes: [] };
      categories.push(currentCategory);
      categoryIndent = indent;
      currentCause = null;
      causeIndent = -1;
    } else if (lower.startsWith("cause:")) {
      if (!currentCategory) return { ok: false, error: `Line ${i + 1}: "cause:" has no parent category` };
      if (indent <= categoryIndent) return { ok: false, error: `Line ${i + 1}: "cause:" must be indented under a category` };
      currentCause = { name: trimmed.slice("cause:".length).trim(), subcauses: [] };
      currentCategory.causes.push(currentCause);
      causeIndent = indent;
    } else if (lower.startsWith("subcause:")) {
      if (!currentCause) return { ok: false, error: `Line ${i + 1}: "subcause:" has no parent cause` };
      if (causeIndent < 0 || indent <= causeIndent) {
        return { ok: false, error: `Line ${i + 1}: "subcause:" must be indented under a cause` };
      }
      currentCause.subcauses.push({ name: trimmed.slice("subcause:".length).trim() });
    } else {
      return { ok: false, error: `Line ${i + 1}: unexpected content — "${trimmed}"` };
    }
  }

  if (!effect) return { ok: false, error: 'Missing required "effect:" field' };

  return { ok: true, data: { effect, categories } };
}
