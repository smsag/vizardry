/**
 * The canvas catalog — one place that knows every canvas the plugin offers
 * and under which id.
 *
 * Three lists feed it, each answering a different question:
 *
 *   • `ALL_FRAMEWORKS`    — grid frameworks, rendered from a declarative
 *                           block layout; their template is generated.
 *   • `CUSTOM_RENDERERS`  — canvases with a bespoke parser + renderer, each
 *                           reachable from a `type:` line.
 *   • `EXTRA_OPTIONS`     — modal-only presets that reuse an existing
 *                           renderer through a variant (`type: matrix, pain`),
 *                           so they are insertable but not dispatchable.
 *
 * They used to be combined ad hoc at two call sites — `main.ts` built the
 * insert-options list, `vizardry-dispatch.ts` built its own renderer map —
 * with nothing checking that an id appears at most once across all three. A
 * collision was silent in both places: the dispatcher's `FRAMEWORKS[id]`
 * quietly won over a same-named custom renderer, and `main.ts` handed
 * Obsidian two commands with the same `insert-<id>` id. Building both views
 * here, from one deduplicated pass, makes such a collision a loud failure at
 * load instead (and a failing unit test long before that).
 */

import type { FrameworkDefinition } from "./types";
import type { FrameworkOption } from "./modal";
import { ALL_FRAMEWORKS } from "./frameworks-registry";
import { CUSTOM_RENDERERS, EXTRA_OPTIONS } from "./processors";
import type { CustomRenderer } from "./processors";
import { generateCanvasTemplate } from "./templates";
import { tFrameworkDescription } from "./i18n";

/** Ids claimed more than once across the three source lists, in encounter order. */
export function findDuplicateIds(idLists: string[][]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const ids of idLists) {
    for (const id of ids) {
      if (seen.has(id) && !duplicates.includes(id)) duplicates.push(id);
      seen.add(id);
    }
  }
  return duplicates;
}

/** The id namespace shared by `type:` values and `insert-<id>` command ids. */
export const CATALOG_ID_LISTS: string[][] = [
  ALL_FRAMEWORKS.map(f => f.id),
  CUSTOM_RENDERERS.map(r => r.id),
  EXTRA_OPTIONS.map(o => o.id),
];

const duplicates = findDuplicateIds(CATALOG_ID_LISTS);
if (duplicates.length > 0) {
  // Not thrown: a duplicate must not take the whole plugin down at load, and
  // the first registration still wins deterministically. The unit test in
  // catalog.test.ts is what actually keeps this at zero.
  console.error(`Vizardry: duplicate canvas ids in the catalog — ${duplicates.join(", ")}`);
}

/** Grid frameworks by `type:` id. */
export const FRAMEWORKS_BY_ID: Record<string, FrameworkDefinition> = Object.fromEntries(
  ALL_FRAMEWORKS.map(f => [f.id, f]),
);

/** Bespoke renderers by `type:` id. */
export const CUSTOM_RENDERERS_BY_ID: Record<string, CustomRenderer> = Object.fromEntries(
  CUSTOM_RENDERERS.map(r => [r.id, r]),
);

/**
 * Everything offered by the insert modal and the per-framework insert
 * commands, in catalog order. Grid frameworks generate their template from
 * their block layout; the other two carry a literal one.
 *
 * A function rather than a constant because the descriptions are translated,
 * and `t()` resolves (and then caches) the UI locale on its first call — which
 * must happen when the plugin loads, not when this module is first imported.
 */
export function getInsertOptions(): FrameworkOption[] {
  return [
    ...ALL_FRAMEWORKS.map(def => ({ id: def.id, label: def.label, template: generateCanvasTemplate(def) })),
    ...CUSTOM_RENDERERS.map(r => ({ id: r.id, label: r.label, template: r.template })),
    ...EXTRA_OPTIONS.map(o => ({ id: o.id, label: o.label, template: o.template })),
  ].map(o => ({ ...o, description: tFrameworkDescription(o.id) }));
}
