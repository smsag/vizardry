import type { ScenarioAxis, ScenarioData, ScenarioQuadrantKey, ScenarioResult } from "./types";

/**
 * Parses the Scenario Matrix (GBN / Schwartz 2×2) source.
 *
 * Syntax:
 *   type: scenario
 *   title: Future of Mobility 2035
 *
 *   x-axis: Energy price | Cheap energy | Expensive energy
 *   y-axis: Autonomy adoption | Slow adoption | Fast adoption
 *
 *   top-left: Gridlock
 *     Cars stay private
 *     Cities congest
 *   top-right: Robo-taxis everywhere
 *   bottom-left: Status quo
 *   bottom-right: Shared & electric
 *
 * Each axis is `name | low pole | high pole` (low = left/bottom, high =
 * right/top). Each quadrant is `<key>: <scenario name>` followed by indented
 * detail lines (rendered as cards). The four quadrant keys map to the pole
 * combinations: top = high y, bottom = low y, left = low x, right = high x.
 *
 * The `type:`/`title:`/`collapsed:` lines are consumed elsewhere and skipped.
 */

const QUAD_KEYS: ScenarioQuadrantKey[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

function parseAxis(value: string): ScenarioAxis | null {
  const parts = value.split("|").map(s => s.trim());
  const [name, low, high] = parts;
  if (!name || !low || !high) return null;
  return { name, low, high };
}

export function parseScenario(source: string): ScenarioResult {
  let xAxis: ScenarioAxis | undefined;
  let yAxis: ScenarioAxis | undefined;
  const quads: Partial<Record<ScenarioQuadrantKey, { name: string; lines: string[] }>> = {};
  let current: ScenarioQuadrantKey | null = null;

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNum = i + 1;
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("title:") || lower.startsWith("type:") || lower.startsWith("collapsed:")) {
      current = null;
      continue;
    }

    if (lower.startsWith("x-axis:") || lower.startsWith("y-axis:")) {
      current = null;
      const axis = parseAxis(trimmed.slice(trimmed.indexOf(":") + 1));
      if (!axis) {
        return { ok: false, error: `Line ${lineNum}: "${trimmed.slice(0, 6)}" needs "name | low pole | high pole"` };
      }
      if (lower.startsWith("x-axis:")) xAxis = axis; else yAxis = axis;
      continue;
    }

    const quadKey = QUAD_KEYS.find(k => lower.startsWith(`${k}:`));
    const indent = raw.search(/\S/);
    if (quadKey && indent === 0) {
      quads[quadKey] = { name: trimmed.slice(quadKey.length + 1).trim(), lines: [] };
      current = quadKey;
      continue;
    }

    if (current && indent > 0) {
      quads[current]!.lines.push(trimmed);
      continue;
    }

    return {
      ok: false,
      error: `Line ${lineNum}: unexpected "${trimmed}" — expected "x-axis:", "y-axis:", or a quadrant (top-left:, top-right:, bottom-left:, bottom-right:)`,
    };
  }

  if (!xAxis) return { ok: false, error: 'Missing "x-axis: name | low pole | high pole"' };
  if (!yAxis) return { ok: false, error: 'Missing "y-axis: name | low pole | high pole"' };

  const quadrant = (k: ScenarioQuadrantKey): { name: string; content: string } => ({
    name: quads[k]?.name ?? "",
    content: (quads[k]?.lines ?? []).join("\n"),
  });

  const data: ScenarioData = {
    xAxis, yAxis,
    quadrants: {
      "top-left": quadrant("top-left"),
      "top-right": quadrant("top-right"),
      "bottom-left": quadrant("bottom-left"),
      "bottom-right": quadrant("bottom-right"),
    },
  };
  return { ok: true, data };
}
