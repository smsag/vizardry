import { VennDiagram, VennItem, VennResult } from "./types";

/**
 * Parses the Venn diagram syntax:
 *
 *   circle: Name
 *     - item text
 *     - [[Note|Alias]]
 *
 *   intersection: Name+Name
 *     - item text
 *
 *   center:          (3-circle only — shorthand for intersection of all three)
 *     - item text
 *
 * Rules:
 * - 2 or 3 circles supported
 * - All circles must be declared before intersections that reference them
 * - Intersection names are case-insensitive and order-insensitive
 * - [[Note|Alias]] links open the note on click; alias is the display text
 * - [[Note]] without alias uses the note name as display text
 */
export function parseVennDiagram(source: string): VennResult {
  const lines = source.split("\n");
  const circles: string[] = [];
  const regionMap = new Map<string, VennItem[]>();
  let currentKey: string | null = null;
  let itemIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      itemIndent = -1;
      currentKey = null;

      if (trimmed.startsWith("circle:")) {
        const name = trimmed.slice("circle:".length).trim();
        if (!name) return { ok: false, error: `Line ${i + 1}: circle requires a name` };
        if (circles.length >= 3) return { ok: false, error: `Line ${i + 1}: maximum 3 circles allowed` };
        circles.push(name);
        currentKey = String(circles.length - 1);
        if (!regionMap.has(currentKey)) regionMap.set(currentKey, []);

      } else if (trimmed.startsWith("intersection:")) {
        const names = trimmed.slice("intersection:".length).trim();
        if (!names) return { ok: false, error: `Line ${i + 1}: intersection requires circle names separated by "+"` };
        const parts = names.split("+").map(s => s.trim()).filter(Boolean);
        if (parts.length < 2) return { ok: false, error: `Line ${i + 1}: intersection requires at least two circle names joined by "+"` };
        const indices: number[] = [];
        for (const part of parts) {
          const idx = circles.findIndex(c => c.toLowerCase() === part.toLowerCase());
          if (idx === -1) return { ok: false, error: `Line ${i + 1}: unknown circle "${part}" — declare all circles before intersections` };
          if (indices.includes(idx)) return { ok: false, error: `Line ${i + 1}: duplicate circle "${part}" in intersection` };
          indices.push(idx);
        }
        indices.sort((a, b) => a - b);
        currentKey = indices.join("+");
        if (!regionMap.has(currentKey)) regionMap.set(currentKey, []);

      } else if (trimmed.startsWith("center:")) {
        if (circles.length !== 3) return { ok: false, error: `Line ${i + 1}: "center:" is only valid with exactly 3 circles` };
        currentKey = "0+1+2";
        if (!regionMap.has(currentKey)) regionMap.set(currentKey, []);

      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected content — "${trimmed}"` };
      }

    } else {
      if (currentKey === null) return { ok: false, error: `Line ${i + 1}: item without a parent circle or intersection` };
      if (itemIndent === -1) itemIndent = indent;
      if (indent !== itemIndent) return { ok: false, error: `Line ${i + 1}: inconsistent indentation` };
      if (!trimmed.startsWith("- ")) return { ok: false, error: `Line ${i + 1}: expected "- item text" or "- [[Note|Alias]]"` };
      const rawItem = trimmed.slice(2).trim();
      if (!rawItem) return { ok: false, error: `Line ${i + 1}: item text is empty` };
      regionMap.get(currentKey)!.push(parseVennItem(rawItem));
    }
  }

  if (circles.length < 2) return { ok: false, error: 'At least 2 "circle:" definitions are required' };

  const regions = Array.from(regionMap.entries())
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ key, items }));

  return {
    ok: true,
    data: { circles: circles.map(name => ({ name })), regions },
  };
}

function parseVennItem(text: string): VennItem {
  const aliased = text.match(/^\[\[([^\]|]+)\|([^\]]+)\]\]$/);
  if (aliased) return { text: aliased[2].trim(), linkTarget: aliased[1].trim() };
  const plain = text.match(/^\[\[([^\]]+)\]\]$/);
  if (plain) return { text: plain[1].trim(), linkTarget: plain[1].trim() };
  return { text };
}
