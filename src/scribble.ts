import type { InkStroke, ScribbleResult } from "./types/scribble";
import { isSkippableLine } from "./shared/indent-tree";
import { decodeStroke } from "./shared/ink-codec";

export const SCRIBBLE_DEFAULT_HEIGHT = 480;
export const SCRIBBLE_MIN_HEIGHT = 160;
export const SCRIBBLE_MAX_HEIGHT = 1600;
export const SCRIBBLE_MAX_STROKES = 5000;
const ID_RE = /^[a-z0-9]{4,24}$/i;

/**
 * Parses Scribble syntax:
 *
 *   id: k3f9x2q1          (written on the first save)
 *   height: 480           (the frame's height in the note, CSS px)
 *   stroke: ink 4 <points>
 *
 * The canvas itself is endless; `height:` only sizes the window onto it.
 * Every line is top-level config. Parsing is graceful: an unreadable stroke,
 * an unknown line or an out-of-range height is skipped or clamped with a
 * warning, so one damaged line never hides the rest of the drawing. Nothing
 * here is fatal — an empty scribble is a valid, blank canvas.
 */
export function parseScribble(source: string): ScribbleResult {
  const lines = source.split("\n");
  const warnings: string[] = [];
  let height = SCRIBBLE_DEFAULT_HEIGHT;
  let id: string | undefined;
  const strokes: InkStroke[] = [];
  let capped = false;

  for (let i = 0; i < lines.length; i++) {
    if (isSkippableLine(lines[i])) continue;
    const trimmed = lines[i].trim();
    const lineNum = i + 1;
    const colon = trimmed.indexOf(":");
    const key = colon === -1 ? "" : trimmed.slice(0, colon).trim().toLowerCase();
    const value = colon === -1 ? "" : trimmed.slice(colon + 1).trim();

    if (key === "stroke") {
      if (strokes.length >= SCRIBBLE_MAX_STROKES) {
        if (!capped) warnings.push(`Only the first ${SCRIBBLE_MAX_STROKES} strokes are shown.`);
        capped = true;
        continue;
      }
      const stroke = decodeStroke(value);
      if (typeof stroke === "string") warnings.push(`Line ${lineNum}: skipped stroke — ${stroke}`);
      else strokes.push(stroke);
    } else if (key === "height") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        warnings.push(`Line ${lineNum}: ignored height "${value}" — not a number`);
        continue;
      }
      height = Math.round(Math.min(SCRIBBLE_MAX_HEIGHT, Math.max(SCRIBBLE_MIN_HEIGHT, n)));
      if (height !== n) warnings.push(`Line ${lineNum}: height ${value} clamped to ${height} (${SCRIBBLE_MIN_HEIGHT}–${SCRIBBLE_MAX_HEIGHT})`);
    } else if (key === "id") {
      if (ID_RE.test(value)) id = value;
      else warnings.push(`Line ${lineNum}: ignored id "${value}" — use 4–24 letters or digits`);
    } else {
      warnings.push(`Line ${lineNum}: ignored — expected a "stroke:", "height:" or "id:" line`);
    }
  }

  return { ok: true, data: { id, height, strokes, warnings: warnings.length > 0 ? warnings : undefined } };
}
