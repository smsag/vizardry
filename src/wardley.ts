import type { WardleyComponent, WardleyLink, WardleyMap, WardleyPipeline, WardleyResult } from "./types";
import { isSkippableLine } from "./shared/indent-tree";

/** Strips a trailing `//` inline comment, but not `://` (URLs). */
function stripInlineComment(s: string): string {
  let idx = 0;
  while (idx < s.length) {
    idx = s.indexOf("//", idx);
    if (idx === -1) return s;
    if (idx > 0 && s[idx - 1] === ":") { idx += 2; continue; }
    return s.slice(0, idx);
  }
  return s;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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
  const links: { from: string; to: string; line: number }[] = [];
  const evolves: { name: string; evolveTo: number; line: number }[] = [];
  const rawPipelines: {
    name: string;
    x1: number;
    x2: number;
    items: { name: string; evolution: number }[];
    line: number;
  }[] = [];
  const warnings: string[] = [];
  let stages: string[] | undefined;
  let stagePositions: number[] | undefined;
  let anchor: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = stripInlineComment(lines[i]);
    const trimmed = raw.trim();
    if (isSkippableLine(trimmed)) continue;

    if (trimmed.startsWith("anchor:")) {
      const name = trimmed.slice("anchor:".length).trim();
      if (!name) { warnings.push(`Line ${i + 1}: anchor has no name — ignored`); continue; }
      anchor = name;
      if (!components.has(name)) {
        components.set(name, { name, visibility: 1, evolution: 0 });
      }
      continue;
    }

    if (trimmed.startsWith("stages:")) {
      const rest = trimmed.slice("stages:".length).trim();
      if (rest) {
        // Empty labels between pipes are dropped rather than fatal.
        const parsed = rest.split("|").map((part) => part.trim()).filter((p) => p !== "");
        if (parsed.length < 2) {
          warnings.push(`Line ${i + 1}: stages needs at least two labels — using defaults`);
          continue;
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
          warnings.push(`Line ${j + 1}: stages entry must be "<position>: <label>" — skipped`);
          continue;
        }
        const position = parseFloat(match[1]);
        const label = match[2].trim();
        if (isNaN(position) || position <= 0 || position >= 1) {
          warnings.push(`Line ${j + 1}: stages position must be between 0 and 1 — skipped`);
          continue;
        }
        if (!label) { warnings.push(`Line ${j + 1}: stages label is empty — skipped`); continue; }
        if (seenPositions.has(position)) {
          warnings.push(`Line ${j + 1}: duplicate stages position ${position} — skipped`);
          continue;
        }
        if (parsedPositions.length > 0 && position <= parsedPositions[parsedPositions.length - 1]) {
          warnings.push(`Line ${j + 1}: stages positions must increase — skipped`);
          continue;
        }
        seenPositions.add(position);
        parsedPositions.push(position);
        parsedStages.push(label);
      }
      if (parsedStages.length >= 2) {
        stages = parsedStages;
        stagePositions = parsedPositions;
      } else {
        warnings.push(`Line ${i + 1}: stages needs at least two positioned labels — using defaults`);
      }
      i = j - 1;
      continue;
    }

    if (trimmed.startsWith("component:")) {
      const rest = trimmed.slice("component:".length).trim();
      const bracketMatch = rest.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!bracketMatch) {
        warnings.push(`Line ${i + 1}: component needs coordinates like [0.8, 0.4] — skipped`);
        continue;
      }
      const name = bracketMatch[1].trim();
      if (!name) { warnings.push(`Line ${i + 1}: component has no name — skipped`); continue; }

      if (explicitLower.has(name.toLowerCase())) {
        warnings.push(`Line ${i + 1}: duplicate component "${name}" — ignored`);
        continue;
      }

      const coords = bracketMatch[2].split(",").map(s => parseFloat(s.trim()));
      if (coords.length !== 2 || coords.some(isNaN)) {
        warnings.push(`Line ${i + 1}: component "${name}" has invalid coordinates — skipped`);
        continue;
      }
      let [visibility, evolution] = coords;
      if (visibility < 0 || visibility > 1 || evolution < 0 || evolution > 1) {
        warnings.push(`Line ${i + 1}: component "${name}" coordinates clamped to 0–1`);
        visibility = clamp01(visibility);
        evolution = clamp01(evolution);
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
        warnings.push(`Line ${i + 1}: evolve needs a component and a target like "evolve: Web App 0.8" — skipped`);
        continue;
      }
      const name = match[1].trim();
      const evolveTo = parseFloat(match[2]);
      if (!name) { warnings.push(`Line ${i + 1}: evolve has no component name — skipped`); continue; }
      if (isNaN(evolveTo) || evolveTo < 0 || evolveTo > 1) {
        warnings.push(`Line ${i + 1}: evolve target must be between 0 and 1 — skipped`);
        continue;
      }
      evolves.push({ name, evolveTo, line: i + 1 });
      continue;
    }

    if (trimmed.startsWith("pipeline:")) {
      // Consume the indented block first so a bad header never leaks its items
      // as unrecognised top-level lines.
      let j = i + 1;
      const rawItems: { text: string; line: number }[] = [];
      for (; j < lines.length; j++) {
        const entryRaw = stripInlineComment(lines[j]);
        const entryTrimmed = entryRaw.trim();
        if (entryTrimmed === "") continue;
        if (!/^\s/.test(entryRaw)) break;
        rawItems.push({ text: entryTrimmed, line: j + 1 });
      }
      const skipBlock = (): void => { i = j - 1; };

      const rest = trimmed.slice("pipeline:".length).trim();
      const bracketMatch = rest.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!bracketMatch) {
        warnings.push(`Line ${i + 1}: pipeline needs a range like [0.3, 0.7] — skipped`);
        skipBlock(); continue;
      }
      const name = bracketMatch[1].trim();
      if (!name) { warnings.push(`Line ${i + 1}: pipeline has no component name — skipped`); skipBlock(); continue; }

      const bounds = bracketMatch[2].split(",").map(s => parseFloat(s.trim()));
      if (bounds.length !== 2 || bounds.some(isNaN)) {
        warnings.push(`Line ${i + 1}: pipeline range must be two numbers — skipped`);
        skipBlock(); continue;
      }
      let [x1, x2] = bounds;
      if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
        warnings.push(`Line ${i + 1}: pipeline range clamped to 0–1`);
        x1 = clamp01(x1); x2 = clamp01(x2);
      }
      if (x1 >= x2) {
        warnings.push(`Line ${i + 1}: pipeline range start must be less than end — skipped`);
        skipBlock(); continue;
      }

      const items: { name: string; evolution: number }[] = [];
      for (const it of rawItems) {
        const m = it.text.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        if (!m) { warnings.push(`Line ${it.line}: pipeline item must be "<name> [evolution]" — skipped`); continue; }
        const itemName = m[1].trim();
        if (!itemName) { warnings.push(`Line ${it.line}: pipeline item has no name — skipped`); continue; }
        const evo = parseFloat(m[2].trim());
        if (isNaN(evo) || evo < 0 || evo > 1) {
          warnings.push(`Line ${it.line}: pipeline item evolution must be between 0 and 1 — skipped`); continue;
        }
        if (evo < x1 || evo > x2) {
          warnings.push(`Line ${it.line}: pipeline item evolution ${evo} is outside the range [${x1}, ${x2}] — skipped`); continue;
        }
        items.push({ name: itemName, evolution: evo });
      }
      if (items.length === 0) {
        warnings.push(`Line ${i + 1}: pipeline "${name}" has no valid sub-components — skipped`);
        skipBlock(); continue;
      }

      rawPipelines.push({ name, x1, x2, items, line: i + 1 });
      skipBlock();
      continue;
    }

    if (trimmed.startsWith("link:")) {
      const rest = trimmed.slice("link:".length).trim();
      const arrowIdx = rest.indexOf("->");
      if (arrowIdx === -1) {
        warnings.push(`Line ${i + 1}: link needs "->" like "link: A -> B" — skipped`);
        continue;
      }
      const from = rest.slice(0, arrowIdx).trim();
      const to = rest.slice(arrowIdx + 2).trim();
      if (!from || !to) { warnings.push(`Line ${i + 1}: link needs two component names — skipped`); continue; }
      links.push({ from, to, line: i + 1 });
      continue;
    }

    warnings.push(`Line ${i + 1}: unrecognised line "${trimmed}" — skipped`);
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
    if (!from) { warnings.push(`Line ${link.line}: link references unknown component "${link.from}" — skipped`); continue; }
    if (!to) { warnings.push(`Line ${link.line}: link references unknown component "${link.to}" — skipped`); continue; }
    if (from === to) { warnings.push(`Line ${link.line}: a component can't link to itself ("${from}") — skipped`); continue; }
    const key = `${from} ${to}`;
    if (seenLinks.has(key)) continue; // drop duplicate
    seenLinks.add(key);
    resolvedLinks.push({ from, to });
  }

  // Resolve evolve directives onto their components (case-insensitive).
  const evolved = new Set<string>();
  for (const e of evolves) {
    const canon = canonical.get(e.name.toLowerCase());
    if (!canon) { warnings.push(`Line ${e.line}: evolve references unknown component "${e.name}" — skipped`); continue; }
    if (evolved.has(canon)) { warnings.push(`Line ${e.line}: duplicate evolve for "${canon}" — ignored`); continue; }
    evolved.add(canon);
    components.get(canon)!.evolveTo = e.evolveTo;
  }

  // Resolve pipeline components case-insensitively; reject unknowns & duplicates.
  const pipelines: WardleyPipeline[] = [];
  const pipelinedComponents = new Set<string>();
  for (const p of rawPipelines) {
    const canon = canonical.get(p.name.toLowerCase());
    if (!canon) { warnings.push(`Line ${p.line}: pipeline references unknown component "${p.name}" — skipped`); continue; }
    if (pipelinedComponents.has(canon)) { warnings.push(`Line ${p.line}: duplicate pipeline for "${canon}" — ignored`); continue; }
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
    warnings: warnings.length ? warnings : undefined,
  };

  return { ok: true, data };
}
