import type { ConceptMap, ConceptMapEdge, ConceptMapResult } from "./types";

/**
 * Parses Concept Map syntax:
 *
 *   title: My Map              (optional)
 *   // comment
 *
 *   Concept A -- relationship --> Concept B
 *   Concept A --> Concept C
 *
 * Each line is either:
 *   - blank / comment — skipped
 *   - "title: ..." — skipped (extracted by the renderer)
 *   - "A -- label --> B" — directed edge with label
 *   - "A --> B"           — directed edge without label
 */
export function parseConceptMap(source: string): ConceptMapResult {
  const lines = source.split("\n");
  const nodeSet = new Set<string>();
  const edges: ConceptMapEdge[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || trimmed.startsWith("//") || lower.startsWith("title:") || lower.startsWith("collapsed:")) continue;

    // Labeled edge: A -- label --> B
    const labeled = trimmed.match(/^(.+?)\s+--\s+(.+?)\s+-->\s+(.+)$/);
    if (labeled) {
      const from = labeled[1].trim();
      const label = labeled[2].trim();
      const to = labeled[3].trim();
      if (from === to) return { ok: false, error: `Line ${i + 1}: self-loops are not allowed` };
      nodeSet.add(from);
      nodeSet.add(to);
      edges.push({ from, to, label });
      continue;
    }

    // Unlabeled edge: A --> B
    const unlabeled = trimmed.match(/^(.+?)\s+-->\s+(.+)$/);
    if (unlabeled) {
      const from = unlabeled[1].trim();
      const to = unlabeled[2].trim();
      if (from === to) return { ok: false, error: `Line ${i + 1}: self-loops are not allowed` };
      nodeSet.add(from);
      nodeSet.add(to);
      edges.push({ from, to, label: "" });
      continue;
    }

    return { ok: false, error: `Line ${i + 1}: expected "A -- label --> B" or "A --> B"` };
  }

  if (nodeSet.size === 0) {
    return { ok: false, error: 'No edges defined — add at least one, e.g. "A -- relates to --> B"' };
  }

  const MAX_NODES = 50;
  if (nodeSet.size > MAX_NODES) {
    return { ok: false, error: `Concept map has ${nodeSet.size} nodes — limit is ${MAX_NODES}. Split into smaller maps.` };
  }

  return { ok: true, data: { nodes: [...nodeSet], edges } };
}
