import type { ImpactMapResult, ImpactActor, ImpactItem } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

export function parseImpactMap(source: string): ImpactMapResult {
  const lines = source.split("\n");
  let goal = "";
  const actors: ImpactActor[] = [];
  let currentActor: ImpactActor | null = null;
  let currentImpact: ImpactItem | null = null;
  let actorIndent = -1;
  let impactIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (isSkippableLine(trimmed)) continue;

    const indent = raw.search(/\S/);

    const lower = trimmed.toLowerCase();

    if (lower.startsWith("goal:")) {
      if (indent !== 0) return { ok: false, error: `Line ${i + 1}: "goal:" must be at root level` };
      goal = trimmed.slice("goal:".length).trim();
    } else if (lower.startsWith("actor:")) {
      if (indent !== 0) return { ok: false, error: `Line ${i + 1}: "actor:" must be at root level` };
      const name = trimmed.slice("actor:".length).trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: actor requires a name` };
      currentActor = { name, impacts: [] };
      actors.push(currentActor);
      actorIndent = indent;
      currentImpact = null;
      impactIndent = -1;
    } else if (lower.startsWith("impact:")) {
      if (!currentActor) return { ok: false, error: `Line ${i + 1}: "impact:" has no parent actor` };
      if (indent <= actorIndent) return { ok: false, error: `Line ${i + 1}: "impact:" must be indented under an actor` };
      const name = trimmed.slice("impact:".length).trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: impact requires a name` };
      currentImpact = { name, deliverables: [] };
      currentActor.impacts.push(currentImpact);
      impactIndent = indent;
    } else if (lower.startsWith("deliverable:")) {
      if (!currentImpact) return { ok: false, error: `Line ${i + 1}: "deliverable:" has no parent impact` };
      if (impactIndent < 0 || indent <= impactIndent) {
        return { ok: false, error: `Line ${i + 1}: "deliverable:" must be indented under an impact` };
      }
      const name = trimmed.slice("deliverable:".length).trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: deliverable requires a name` };
      currentImpact.deliverables.push(name);
    } else {
      return { ok: false, error: `Line ${i + 1}: unexpected content — "${trimmed}"` };
    }
  }

  return { ok: true, data: { goal, actors } };
}
