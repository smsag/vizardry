/**
 * Word-wrapping for native SVG text. The swim-lane node renderer draws its
 * label and bullets as real SVG <text>/<tspan> (not foreignObject HTML), so it
 * must compute line breaks itself. Because the renderer emits exactly the lines
 * this module returns AND sizes the box to that line count, wrapping is always
 * self-consistent — a box can never clip its own text regardless of the exact
 * font metrics.
 *
 * Widths come from a shared canvas 2D context (accurate, synchronous, works on
 * iOS/WebKit). When no canvas is available (headless tests) it falls back to an
 * average-glyph-width estimate; the tspans still match the reported line count.
 */

// A neutral system-UI stack approximating Obsidian's --font-interface. Used only
// for MEASUREMENT; the SVG text itself renders with the theme's actual font.
const UI_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export interface TextMeasurer {
  /** Pixel width of `text` at `fontPx` in the UI font. */
  width(text: string, fontPx: number): number;
}

export function createTextMeasurer(): TextMeasurer {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  } catch {
    ctx = null;
  }
  return {
    width(text: string, fontPx: number): number {
      if (ctx) {
        ctx.font = `${fontPx}px ${UI_FONT_STACK}`;
        const w = ctx.measureText(text).width;
        if (w > 0 || text === "") return w;
      }
      // Fallback: average glyph ≈ 0.52em for UI text.
      return text.length * fontPx * 0.52;
    },
  };
}

/** Greedy break of an over-long single word into pieces that each fit. */
function breakWord(word: string, maxWidth: number, measure: (s: string) => number): string[] {
  const pieces: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur && measure(cur + ch) > maxWidth) {
      pieces.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) pieces.push(cur);
  return pieces.length ? pieces : [word];
}

/**
 * Greedy word-wrap `text` to lines no wider than `maxWidth` px. Honours explicit
 * "\n" breaks. Always returns at least one line.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (measure(cand) <= maxWidth) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      if (measure(w) > maxWidth) {
        const parts = breakWord(w, maxWidth, measure);
        for (let i = 0; i < parts.length - 1; i++) out.push(parts[i]);
        line = parts[parts.length - 1];
      } else {
        line = w;
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}
