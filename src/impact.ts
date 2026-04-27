import { ImpactMap, ImpactMapResult, ImpactActor, ImpactItem } from "./types";

export function parseImpactMap(source: string): ImpactMapResult {
  const lines = source.split("\n");
  let goal = "";
  const actors: ImpactActor[] = [];
  let currentActor: ImpactActor | null = null;
  let currentImpact: ImpactItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.search(/\S/);

    if (trimmed.startsWith("goal:")) {
      if (indent !== 0) return { ok: false, error: `Line ${i + 1}: "goal:" must be at root level` };
      goal = trimmed.slice("goal:".length).trim();
    } else if (trimmed.startsWith("actor:")) {
      if (indent !== 0) return { ok: false, error: `Line ${i + 1}: "actor:" must be at root level` };
      currentActor = { name: trimmed.slice("actor:".length).trim(), impacts: [] };
      actors.push(currentActor);
      currentImpact = null;
    } else if (trimmed.startsWith("impact:")) {
      if (indent === 0) return { ok: false, error: `Line ${i + 1}: "impact:" must be indented under an actor` };
      if (!currentActor) return { ok: false, error: `Line ${i + 1}: "impact:" has no parent actor` };
      currentImpact = { name: trimmed.slice("impact:".length).trim(), deliverables: [] };
      currentActor.impacts.push(currentImpact);
    } else if (trimmed.startsWith("deliverable:")) {
      if (indent === 0) return { ok: false, error: `Line ${i + 1}: "deliverable:" must be indented under an impact` };
      if (!currentImpact) return { ok: false, error: `Line ${i + 1}: "deliverable:" has no parent impact` };
      currentImpact.deliverables.push(trimmed.slice("deliverable:".length).trim());
    } else {
      return { ok: false, error: `Line ${i + 1}: unexpected content — "${trimmed}"` };
    }
  }

  if (!goal) return { ok: false, error: 'Missing required "goal:" field' };

  return { ok: true, data: { goal, actors } };
}
