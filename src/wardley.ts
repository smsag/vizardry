import type { WardleyComponent, WardleyLink, WardleyMap, WardleyResult } from "./types";

/**
 * Parses Wardley Map syntax:
 *
 *   anchor: <name>
 *   component: <name> [visibility, evolution]   # coords 0–1
 *   link: <from> -> <to>
 *
 * visibility: 1 = visible to user (top), 0 = invisible infrastructure (bottom)
 * evolution:  0 = Genesis (left), 1 = Commodity (right)
 */
export function parseWardleyMap(source: string): WardleyResult {
  const lines = source.split("\n");
  const components = new Map<string, WardleyComponent>();
  const explicitComponents = new Set<string>(); // has an explicit component: line
  const links: WardleyLink[] = [];
  let anchor: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("anchor:")) {
      const name = trimmed.slice("anchor:".length).trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: anchor requires a name` };
      anchor = name;
      if (!components.has(name)) {
        components.set(name, { name, visibility: 1, evolution: 0 });
      }
      continue;
    }

    if (trimmed.startsWith("component:")) {
      const rest = trimmed.slice("component:".length).trim();
      // strip inline comment
      const noComment = rest.replace(/#.*$/, "").trim();
      const bracketMatch = noComment.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (!bracketMatch) {
        return { ok: false, error: `Line ${i + 1}: component requires coordinates, e.g. component: Name [0.8, 0.4]` };
      }
      const name = bracketMatch[1].trim();
      if (!name) return { ok: false, error: `Line ${i + 1}: component requires a name` };

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
      continue;
    }

    if (trimmed.startsWith("link:")) {
      const rest = trimmed.slice("link:".length).trim().replace(/#.*$/, "").trim();
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

    return { ok: false, error: `Line ${i + 1}: unrecognised keyword — expected anchor, component, or link` };
  }

  if (components.size === 0) {
    return { ok: false, error: "No components defined" };
  }

  // Validate link references
  for (const link of links) {
    if (!components.has(link.from)) {
      return { ok: false, error: `Link references unknown component "${link.from}"` };
    }
    if (!components.has(link.to)) {
      return { ok: false, error: `Link references unknown component "${link.to}"` };
    }
  }

  const data: WardleyMap = {
    anchor: anchor ?? null,
    components: [...components.values()],
    links,
    explicitComponents,
  };

  return { ok: true, data };
}
