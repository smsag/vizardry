import type { RoadmapColumn, RoadmapData, RoadmapItem, RoadmapResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

const COLUMN_IDS = ["now", "next", "later"] as const;
type ColId = typeof COLUMN_IDS[number];

export function parseRoadmap(source: string): RoadmapResult {
  const lines = source.split("\n");

  const colMap = new Map<ColId, RoadmapItem[]>(COLUMN_IDS.map(id => [id, []]));

  let currentColId: ColId | null = null;
  let blockIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      blockIndent = -1;

      const lower = trimmed.toLowerCase();
      if (lower === "now:" || lower === "next:" || lower === "later:") {
        currentColId = lower.slice(0, -1) as ColId;
      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected key — "${trimmed}". Expected "now:", "next:", or "later:"` };
      }

    } else if (currentColId !== null) {
      if (blockIndent === -1) blockIndent = indent;

      if (indent === blockIndent) {
        if (!trimmed.toLowerCase().startsWith("item:")) {
          return { ok: false, error: `Line ${i + 1}: expected "item: <title>" — "${trimmed}"` };
        }
        const rest = trimmed.slice("item:".length);
        const pipeIdx = rest.indexOf("|");
        const title    = pipeIdx === -1 ? rest.trim() : rest.slice(0, pipeIdx).trim();
        const subtitle = pipeIdx === -1 ? ""          : rest.slice(pipeIdx + 1).trim();
        if (!title) return { ok: false, error: `Line ${i + 1}: item requires a title` };
        colMap.get(currentColId)!.push({ title, subtitle });

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
