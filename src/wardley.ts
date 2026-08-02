import type { WardleyComponent, WardleyLink, WardleyMap, WardleyPipeline, WardleyResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

/** Strips a trailing `//` inline comment (matching the pacelayers convention). */
function stripInlineComment(s: string): string {
  const idx = s.indexOf("//");
  return idx === -1 ? s : s.slice(0, idx);
}

/**
 * Parses Wardley Map syntax:
 *
 *   anchor: <name>
 *   stages: <label> | <label> | ...
 *   component: <name> [visibility, evolution]   # coords 0–1
 *   link: <from> -> <to>
 *
 * visibility: 1 = visible to user (top), 0 = invisible infrastructure (bottom)
 * evolution:  0 = Genesis (left), 1 = Commodity (right)
 *
 * Inline `//` comments are stripped from every line; link endpoints resolve
 * case-insensitively to declared component names.
 */
export function parseWardleyMap(source: string): WardleyResult {
  const lines = source.split("\n");
  const components = new Map<string, WardleyComponent>();
  const explicitComponents = new Set<string>(); // has an explicit component: line
  const explicitLower = new Set<string>();       // lower-cased, for duplicate detection
  const links: WardleyLink[] = [];
  const evolves: { name: string; evolveTo: number }[] = [];
  const rawPipelines: {
    name: string;
    x1: number;
    x2: number;
    items: { name: string; evolution: number }[];
  }[] = [];
  let stages: string[] | undefined;
  let stagePositions: number[] | undefined;
  let anchor: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = stripInlineComment(lines[i]);
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    if (trimmed.startsWith("anchor:")) {
      const name = trimmed.slice("anchor:".length).trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: anchor requires a name` };
      anchor = name;
      if (!components.has(name)) {
        components.set(name, { name, visibility: 1, evolution: 0 });
      }
      continue;
    }

    if (trimmed.startsWith("stages:")) {
      const rest = trimmed.slice("stages:".length).trim();
      if (rest) {
        const parsed = rest.split("|").map((part) => part.trim());
        if (parsed.some((label) => !label)) {
          return { ok: false, error: `Line ${i + 1}: stages contains an empty label` };
        }
        if (parsed.length < 2) {
          return { ok: false, error: `Line ${i + 1}: stages requires at least two labels` };
        }
        stages = parsed;
        stagePositions = undefined;
        continue;
      }

      // Multiline positioned stages syntax:
      // stages:
      //   0.05: Driver
      //   0.28: Approver
      //   ...
      const parsedStages: string[] = [];
      const parsedPositions: number[] = [];
      const seenPositions = new Set<number>();
      let j = i + 1;
      for (; j < lines.length; j++) {
        const entryRaw = stripInlineComment(lines[j]);
        const entryTrimmed = entryRaw.trim();
        if (entryTrimmed === "") continue;
        if (!/^\s/.test(entryRaw)) break;

        const match = entryTrimmed.match(/^([0-9]*\.?[0-9]+)\s*:\s*(.+)$/);
        if (!match) {
          return { ok: false, error: `Line ${j + 1}: stages entry must be in the form \"<position>: <label>\"` };
        }
        const position = parseFloat(match[1]);
        const label = match[2].trim();
        if (isNaN(position) || position <= 0 || position >= 1) {
          return { ok: false, error: `Line ${j + 1}: stages position must be between 0 and 1 (exclusive)` };
        }
        if (!label) {
          return { ok: false, error: `Line ${j + 1}: stages label must not be empty` };
        }
        if (seenPositions.has(position)) {
          return { ok: false, error: `Line ${j + 1}: duplicate stages position ${position}` };
        }
        if (parsedPositions.length > 0 && position <= parsedPositions[parsedPositions.length - 1]) {
          return { ok: false, error: `Line ${j + 1}: stages positions must be strictly increasing` };
        }
        seenPositions.add(position);
        parsedPositions.push(position);
        parsedStages.push(label);
      }
      if (parsedStages.length < 2) {
        return { ok: false, error: `Line ${i + 1}: stages requires at least two positioned labels` };
      }

      stages = parsedStages;
      stagePositions = parsedPositions;
      i = j - 1;
      continue;
    }

    if (trimmed.startsWith("component:")) {
      const rest = trimmed.slice("component:".length).trim();
      const bracketMatch = rest.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!bracketMatch) {
        return { ok: false, error: `Line ${i + 1}: component requires coordinates, e.g. component: Name [0.8, 0.4]` };
      }
      const name = bracketMatch[1].trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: component requires a name` };

      if (explicitLower.has(name.toLowerCase())) {
        return { ok: false, error: `Line ${i + 1}: duplicate component "${name}"` };
      }

      const coords = bracketMatch[2].split(",").map(s => parseFloat(s.trim()));
      if (coords.length !== 2 || coords.some(isNaN)) {
        return { ok: false, error: `Line ${i + 1}: coordinates must be two numbers between 0 and 1, e.g. [0.8, 0.4]` };
      }
      const [visibility, evolution] = coords;
      if (visibility < 0 || visibility > 1 || evolution < 0 || evolution > 1) {
        return { ok: false, error: `Line ${i + 1}: coordinates must be between 0 and 1` };
      }

      if (components.has(name)) {
        // anchor declared the component already — update coords
        const existing = components.get(name)!;
        existing.visibility = visibility;
        existing.evolution = evolution;
      } else {
        components.set(name, { name, visibility, evolution });
      }
      explicitComponents.add(name);
      explicitLower.add(name.toLowerCase());
      continue;
    }

    if (trimmed.startsWith("evolve:")) {
      const rest = trimmed.slice("evolve:".length).trim();
      // Trailing number is the target evolution; the rest (may contain spaces) is the name.
      const match = rest.match(/^(.*?)\s+([0-9]*\.?[0-9]+)$/);
      if (!match) {
        return { ok: false, error: `Line ${i + 1}: evolve requires a component and a target, e.g. evolve: Web App 0.8` };
      }
      const name = match[1].trim();
      const evolveTo = parseFloat(match[2]);
      if (!name) return { ok: false, error: `Line ${i + 1}: evolve requires a component name` };
      if (isNaN(evolveTo) || evolveTo < 0 || evolveTo > 1) {
        return { ok: false, error: `Line ${i + 1}: evolve target must be between 0 and 1` };
      }
      evolves.push({ name, evolveTo });
      continue;
    }

    if (trimmed.startsWith("pipeline:")) {
      const rest = trimmed.slice("pipeline:".length).trim();
      const bracketMatch = rest.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!bracketMatch) {
        return { ok: false, error: `Line ${i + 1}: pipeline requires a range, e.g. pipeline: Name [0.3, 0.7]` };
      }
      const name = bracketMatch[1].trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: pipeline requires a component name` };

      const bounds = bracketMatch[2].split(",").map(s => parseFloat(s.trim()));
      if (bounds.length !== 2 || bounds.some(isNaN)) {
        return { ok: false, error: `Line ${i + 1}: pipeline range must be two numbers, e.g. [0.3, 0.7]` };
      }
      const [x1, x2] = bounds;
      if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
        return { ok: false, error: `Line ${i + 1}: pipeline range must be between 0 and 1` };
      }
      if (x1 >= x2) {
        return { ok: false, error: `Line ${i + 1}: pipeline range start must be less than end` };
      }

      // Indented sub-component lines: "<name> [evolution]"
      const items: { name: string; evolution: number }[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const entryRaw = stripInlineComment(lines[j]);
        const entryTrimmed = entryRaw.trim();
        if (entryTrimmed === "") continue;
        if (!/^\s/.test(entryRaw)) break;

        const m = entryTrimmed.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        if (!m) {
          return { ok: false, error: `Line ${j + 1}: pipeline item must be in the form "<name> [evolution]"` };
        }
        const itemName = m[1].trim();
        if (!itemName) return { ok: false, error: `Line ${j + 1}: pipeline item requires a name` };
        const evo = parseFloat(m[2].trim());
        if (isNaN(evo) || evo < 0 || evo > 1) {
          return { ok: false, error: `Line ${j + 1}: pipeline item evolution must be between 0 and 1` };
        }
        if (evo < x1 || evo > x2) {
          return { ok: false, error: `Line ${j + 1}: pipeline item evolution ${evo} must fall within the pipeline range [${x1}, ${x2}]` };
        }
        items.push({ name: itemName, evolution: evo });
      }
      if (items.length === 0) {
        return { ok: false, error: `Line ${i + 1}: pipeline requires at least one sub-component` };
      }

      rawPipelines.push({ name, x1, x2, items });
      i = j - 1;
      continue;
    }

    if (trimmed.startsWith("link:")) {
      const rest = trimmed.slice("link:".length).trim();
      const arrowIdx = rest.indexOf("->");
      if (arrowIdx === -1) {
        return { ok: false, error: `Line ${i + 1}: link requires "->" separator, e.g. link: A -> B` };
      }
      const from = rest.slice(0, arrowIdx).trim();
      const to = rest.slice(arrowIdx + 2).trim();
      if (!from || !to) return { ok: false, error: `Line ${i + 1}: link requires two component names` };
      links.push({ from, to });
      continue;
    }

    return { ok: false, error: `Line ${i + 1}: unrecognised keyword — expected anchor, stages, component, pipeline, evolve, or link` };
  }

  if (components.size === 0) {
    return { ok: false, error: "No components defined" };
  }

  // Resolve link endpoints case-insensitively to the declared component name,
  // reject self-links, and drop exact duplicates.
  const canonical = new Map<string, string>();
  for (const c of components.values()) canonical.set(c.name.toLowerCase(), c.name);

  const resolvedLinks: WardleyLink[] = [];
  const seenLinks = new Set<string>();
  for (const link of links) {
    const from = canonical.get(link.from.toLowerCase());
    const to = canonical.get(link.to.toLowerCase());
    if (!from) return { ok: false, error: `Link references unknown component "${link.from}"` };
    if (!to) return { ok: false, error: `Link references unknown component "${link.to}"` };
    if (from === to) return { ok: false, error: `Link cannot connect a component to itself ("${from}")` };
    const key = `${from} ${to}`;
    if (seenLinks.has(key)) continue; // drop duplicate
    seenLinks.add(key);
    resolvedLinks.push({ from, to });
  }

  // Resolve evolve directives onto their components (case-insensitive).
  const evolved = new Set<string>();
  for (const e of evolves) {
    const canon = canonical.get(e.name.toLowerCase());
    if (!canon) return { ok: false, error: `evolve references unknown component "${e.name}"` };
    if (evolved.has(canon)) return { ok: false, error: `Duplicate evolve for component "${canon}"` };
    evolved.add(canon);
    components.get(canon)!.evolveTo = e.evolveTo;
  }

  // Resolve pipeline components case-insensitively; reject unknowns & duplicates.
  const pipelines: WardleyPipeline[] = [];
  const pipelinedComponents = new Set<string>();
  for (const p of rawPipelines) {
    const canon = canonical.get(p.name.toLowerCase());
    if (!canon) return { ok: false, error: `pipeline references unknown component "${p.name}"` };
    if (pipelinedComponents.has(canon)) return { ok: false, error: `Duplicate pipeline for component "${canon}"` };
    pipelinedComponents.add(canon);
    pipelines.push({ component: canon, x1: p.x1, x2: p.x2, items: p.items });
  }

  const data: WardleyMap = {
    anchor: anchor ?? null,
    components: [...components.values()],
    links: resolvedLinks,
    pipelines,
    stages,
    stagePositions,
    explicitComponents,
  };

  return { ok: true, data };
}
