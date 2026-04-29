import { StoryMap, StoryMapResult } from "./types";

/**
 * Parses the Story Map syntax:
 *
 *   backbone: Activity 1 | Activity 2 | Activity 3
 *
 *   slice: Release Name
 *     Activity 1: Single-line story
 *     Activity 2:
 *       Multi-line story line 1
 *       Multi-line story line 2
 *
 * Rules:
 * - `backbone:` is required; activities are pipe-separated
 * - Each `slice:` starts a release lane
 * - Within a slice, `ActivityName: content` maps stories to backbone columns
 * - Activity names are matched case-insensitively against the backbone
 * - Unknown activity names are stored but produce empty cells in the grid
 * - Multi-line cell content uses deeper indentation below the activity line
 */
export function parseStoryMap(source: string): StoryMapResult {
  const lines = source.split("\n");
  let backbone: string[] = [];
  const slices: { name: string; cells: Record<string, string> }[] = [];
  let currentSlice: { name: string; cells: Record<string, string> } | null = null;
  let currentActivity: string | null = null;
  let sliceIndent = -1;
  let cellLines: string[] = [];

  function flushCell(): void {
    if (currentSlice && currentActivity !== null && cellLines.length > 0) {
      const key = currentActivity.toLowerCase().trim();
      const trimmedLines = [...cellLines];
      while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() === "") {
        trimmedLines.pop();
      }
      if (trimmedLines.length > 0) {
        currentSlice.cells[key] = trimmedLines.join("\n");
      }
    }
    cellLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      flushCell();
      currentActivity = null;
      sliceIndent = -1;

      if (trimmed.startsWith("backbone:")) {
        const backboneStr = trimmed.slice("backbone:".length).trim();
        backbone = backboneStr.split("|").map(s => s.trim()).filter(s => s.length > 0);
      } else if (trimmed.startsWith("slice:")) {
        const sliceName = trimmed.slice("slice:".length).trim();
        if (!sliceName) {
          return { ok: false, error: `Line ${i + 1}: "slice:" requires a name` };
        }
        currentSlice = { name: sliceName, cells: {} };
        slices.push(currentSlice);
      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected syntax — "${trimmed}"` };
      }
    } else {
      // Indented line — must be within a slice
      if (!currentSlice) {
        return { ok: false, error: `Line ${i + 1}: indented content outside a slice` };
      }

      // First indented line after a slice: sets the activity indent level
      if (sliceIndent === -1) sliceIndent = indent;

      if (indent === sliceIndent) {
        // New activity cell
        flushCell();
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) {
          return { ok: false, error: `Line ${i + 1}: expected "Activity: content" — "${trimmed}"` };
        }
        currentActivity = trimmed.slice(0, colonIdx).trim();
        const inlineContent = trimmed.slice(colonIdx + 1).trim();
        cellLines = inlineContent ? [inlineContent] : [];
      } else if (indent > sliceIndent && currentActivity !== null) {
        // Multi-line content continuation
        cellLines.push(trimmed);
      } else {
        return { ok: false, error: `Line ${i + 1}: unexpected indentation — "${trimmed}"` };
      }
    }
  }

  flushCell();

  if (backbone.length === 0) {
    return { ok: false, error: 'Missing required "backbone:" field' };
  }
  if (slices.length === 0) {
    return { ok: false, error: 'At least one "slice:" is required' };
  }

  return { ok: true, data: { backbone, slices } };
}
