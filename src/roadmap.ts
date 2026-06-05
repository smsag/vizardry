import type { RoadmapColumn, RoadmapData, RoadmapItem, RoadmapResult } from "./types";

const COLUMN_IDS = ["now", "next", "later"] as const;
type ColId = typeof COLUMN_IDS[number];

export function parseRoadmap(source: string): RoadmapResult {
  const lines = source.split("\n");

  const colMap = new Map<ColId, RoadmapItem[]>(COLUMN_IDS.map(id => [id, []]));

  let currentColId: ColId | null = null;
  let currentItem: RoadmapItem | null = null;
  let blockIndent = -1;
  let subtitleIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("title:")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      currentItem = null;
      blockIndent = -1;
      subtitleIndent = -1;

      const lower = trimmed.toLowerCase();
      if (lower === "now:" || lower === "next:" || lower === "later:") {
        currentColId = lower.slice(0, -1) as ColId;
      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected key — "${trimmed}". Expected "now:", "next:", or "later:"` };
      }

    } else if (currentColId !== null) {
      if (blockIndent === -1) blockIndent = indent;

      if (indent === blockIndent) {
        subtitleIndent = -1;
        if (!trimmed.toLowerCase().startsWith("item:")) {
          return { ok: false, error: `Line ${i + 1}: expected "item: <title>" — "${trimmed}"` };
        }
        const title = trimmed.slice("item:".length).trim();
        if (!title) return { ok: false, error: `Line ${i + 1}: item requires a title` };
        currentItem = { title, subtitle: "" };
        colMap.get(currentColId)!.push(currentItem);

      } else if (indent > blockIndent && currentItem !== null) {
        if (subtitleIndent === -1) subtitleIndent = indent;
        if (indent !== subtitleIndent) {
          return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
        }
        if (!trimmed.toLowerCase().startsWith("subtitle:")) {
          return { ok: false, error: `Line ${i + 1}: expected "subtitle: <text>" — "${trimmed}"` };
        }
        currentItem.subtitle = trimmed.slice("subtitle:".length).trim();

      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
      }

    } else {
      return { ok: false, error: `Line ${i + 1}: indented content outside a column block` };
    }
  }

  const columns: RoadmapColumn[] = COLUMN_IDS.map(id => ({ id, items: colMap.get(id)! }));
  return { ok: true, data: { columns } };
}
