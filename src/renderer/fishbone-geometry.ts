import type { FishboneDiagram } from "../types";

/**
 * Pure layout for the herringbone (true Ishikawa) fishbone: a horizontal spine
 * driving into the effect head, with category "bones" angled off it —
 * alternating above and below — and causes branching from each bone. No DOM
 * here (so it is unit-testable); the renderer turns this into SVG + overlays.
 *
 * All coordinates are absolute from the SVG origin: a final pass shifts every
 * point so the whole drawing sits at (MARGIN, MARGIN) with positive coords,
 * which keeps foreignObject rename inputs (appended at the SVG root) aligned
 * with the native-SVG nodes they overlay.
 */

const MARGIN = 28;
const SPINE_LEFT_PAD = 96;     // tail room left of the first bone
const HEAD_W = 176;
const HEAD_PAD = 20;
const HEAD_NOSE = 30;
const HEAD_MIN_H = 88;
const HEAD_LINE_H = 20;
const HEAD_WRAP_CHARS = 15;
const RIB_ANGLE = 34 * Math.PI / 180;
const ANCHOR_GAP = 214;        // horizontal spacing between same-side bones
const SIDE_STAGGER = 0.5;      // bottom bones offset half a gap from top bones
const RIB_BASE_OFFSET = 48;    // first cause's distance along the rib (clears the spine)
const RIB_TIP_MARGIN = 30;     // rib length beyond the last cause (room for box)
const CAUSE_ROW_H = 20;        // vertical spacing between causes
const SUB_LINE_H = 14;         // vertical height of one sub-cause line
const CAUSE_STUB = 46;         // horizontal cause connector length
const CAT_BOX_W = 132;
const CAT_BOX_H = 30;
const CAUSE_CHAR_W = 6.4;      // approx label width per char (for bounds only)
const CAUSE_MAX_CHARS = 30;
const SUB_CHAR_W = 5.8;
const SUB_MAX_CHARS = 34;

export interface FBSub { text: string; x: number; y: number; }

export interface FBCause {
  text: string;
  /** Rib attach point → stub end (label anchor is the stub end). */
  stub: { x1: number; y1: number; x2: number; y2: number };
  labelX: number;
  labelY: number;
  subs: FBSub[];
}

export interface FBCategory {
  name: string;
  top: boolean;
  colorIndex: number;
  anchor: { x: number; y: number };
  rib: { x1: number; y1: number; x2: number; y2: number };
  box: { x: number; y: number; w: number; h: number };
  causes: FBCause[];
}

export interface FBLayout {
  width: number;
  height: number;
  spine: { x1: number; y1: number; x2: number; y2: number };
  head: { x: number; y: number; w: number; h: number; nose: number; lines: string[] };
  categories: FBCategory[];
  colorCount: number;
}

/** Greedy word wrap by character budget (no DOM measurement needed). */
function wrapChars(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export function layoutFishbone(diagram: FishboneDiagram): FBLayout {
  const cats = diagram.categories;
  const colorCount = Math.max(1, cats.length);

  // Effect head — sized to its wrapped text.
  const headLines = wrapChars(diagram.effect || " ", HEAD_WRAP_CHARS);
  const headH = Math.max(HEAD_MIN_H, HEAD_PAD * 2 + headLines.length * HEAD_LINE_H);

  const midY = 0; // provisional; shifted to positive at the end
  const cos = Math.cos(RIB_ANGLE), sin = Math.sin(RIB_ANGLE);

  // Same-side index for staggered horizontal placement.
  let topN = 0, botN = 0;
  const categories: FBCategory[] = cats.map((cat, idx) => {
    const top = idx % 2 === 0;
    const sideIdx = top ? topN++ : botN++;
    const anchorX = SPINE_LEFT_PAD + sideIdx * ANCHOR_GAP + (top ? 0 : ANCHOR_GAP * SIDE_STAGGER) + ANCHOR_GAP * 0.5;
    const dir = top ? -1 : 1;

    // Walk causes down the rib, advancing by each row's height (so causes with
    // sub-causes get proportionally more room). Distance is measured along the
    // rib; converting a vertical row height to rib distance divides by sin.
    let dist = RIB_BASE_OFFSET;
    const ux = -cos, uy = dir * sin; // rib unit vector (sweeps back toward tail)
    const causes: FBCause[] = cat.causes.map((c) => {
      const rowH = CAUSE_ROW_H + c.subcauses.length * SUB_LINE_H;
      const px = anchorX + ux * dist;
      const py = midY + uy * dist;
      const sx = px + CAUSE_STUB;
      const sy = py;
      // Sub-causes extend OUTWARD (away from the spine), so they never cross it:
      // above the cause on a top bone, below it on a bottom bone.
      const subs: FBSub[] = c.subcauses.map((s, si) => ({
        text: truncate(s.name, SUB_MAX_CHARS),
        x: sx + 12,
        y: sy + dir * (si + 1) * SUB_LINE_H,
      }));
      dist += rowH / sin;
      return {
        text: truncate(c.name, CAUSE_MAX_CHARS),
        stub: { x1: px, y1: py, x2: sx, y2: sy },
        labelX: sx + 5,
        labelY: sy - 2,
        subs,
      };
    });

    const ribLen = Math.max(RIB_BASE_OFFSET + RIB_TIP_MARGIN, dist + RIB_TIP_MARGIN);
    const tipX = anchorX + ux * ribLen;
    const tipY = midY + uy * ribLen;
    const box = {
      x: tipX - CAT_BOX_W / 2,
      y: top ? tipY - CAT_BOX_H : tipY,
      w: CAT_BOX_W,
      h: CAT_BOX_H,
    };
    return {
      name: cat.name,
      top,
      colorIndex: idx,
      anchor: { x: anchorX, y: midY },
      rib: { x1: anchorX, y1: midY, x2: tipX, y2: tipY },
      box,
      causes,
    };
  });

  const spineEndX = SPINE_LEFT_PAD + Math.max(topN, botN, 1) * ANCHOR_GAP + ANCHOR_GAP * (SIDE_STAGGER + 0.5) + 20;
  const spine = { x1: 0, y1: midY, x2: spineEndX, y2: midY };
  const head = {
    x: spineEndX + HEAD_PAD,
    y: midY - headH / 2,
    w: HEAD_W,
    h: headH,
    nose: HEAD_NOSE,
    lines: headLines,
  };

  // ── Bounds pass ─────────────────────────────────────────────────────────────
  let minX = 0, minY = 0, maxX = head.x + head.w + head.nose, maxY = 0;
  const grow = (x: number, y: number): void => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  grow(spine.x1, spine.y1 - 4); grow(spine.x2, spine.y2 + 4);
  grow(head.x, head.y); grow(head.x + head.w + head.nose, head.y + head.h);
  for (const cat of categories) {
    grow(cat.box.x, cat.box.y); grow(cat.box.x + cat.box.w, cat.box.y + cat.box.h);
    grow(cat.rib.x2, cat.rib.y2);
    for (const c of cat.causes) {
      const w = CAUSE_STUB + Math.min(c.text.length, CAUSE_MAX_CHARS) * CAUSE_CHAR_W + 12;
      grow(c.stub.x1, c.stub.y1);
      grow(c.stub.x1 + w, c.stub.y1);
      for (const s of c.subs) {
        grow(s.x + Math.min(s.text.length, SUB_MAX_CHARS) * SUB_CHAR_W + 8, s.y);
      }
    }
  }

  // ── Shift everything to (MARGIN, MARGIN) ─────────────────────────────────────
  const dx = MARGIN - minX, dy = MARGIN - minY;
  const shiftPt = (p: { x: number; y: number }): void => { p.x += dx; p.y += dy; };
  spine.x1 += dx; spine.x2 += dx; spine.y1 += dy; spine.y2 += dy;
  head.x += dx; head.y += dy;
  for (const cat of categories) {
    shiftPt(cat.anchor);
    cat.rib.x1 += dx; cat.rib.x2 += dx; cat.rib.y1 += dy; cat.rib.y2 += dy;
    cat.box.x += dx; cat.box.y += dy;
    for (const c of cat.causes) {
      c.stub.x1 += dx; c.stub.x2 += dx; c.stub.y1 += dy; c.stub.y2 += dy;
      c.labelX += dx; c.labelY += dy;
      for (const s of c.subs) shiftPt(s);
    }
  }

  return {
    width: maxX - minX + MARGIN * 2,
    height: maxY - minY + MARGIN * 2,
    spine, head, categories, colorCount,
  };
}
