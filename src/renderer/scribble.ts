import { getStroke } from "perfect-freehand";
import { Notice, setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { InkColor, InkKind, InkPoint, InkStroke, ScribbleBackground, ScribbleData } from "../types/scribble";
import { INK_COLORS, SCRIBBLE_BACKGROUNDS } from "../types/scribble";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl, FLAT_SHAPE_ATTR } from "../shared/svg";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { encodeStrokeLine, MAX_POINTS_PER_STROKE, quantizePoint } from "../shared/ink-codec";
import { writeScribble } from "../shared/scribble-edit";
import { SCRIBBLE_MAX_STROKES } from "../scribble";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n/locales/en";

/**
 * Scribble canvas: freehand ink on an endless canvas, stored as `stroke:` /
 * `highlight:` lines in the block itself (see shared/ink-codec.ts).
 *
 * Outside draw mode — Reading View, the browser extension, a PNG export, and
 * Live Preview until Draw is tapped — the frame shows everything drawn,
 * fitted and never enlarged past 100 %, and the note scrolls over it. Nothing
 * about the view is stored, so panning never rewrites the note.
 *
 * Draw mode, tuned for iPad + Apple Pencil: the pen (or a mouse) uses the
 * current tool, one finger pans, two fingers pinch-zoom, and touches are
 * ignored while the pen is down and briefly after (palm rejection). With
 * "Draw with finger" on, one finger uses the tool and two still pan and zoom.
 * On a Mac trackpad, two-finger scrolling pans and pinching zooms. Fullscreen
 * opens the same canvas over the whole window.
 *
 * Tools: pen and highlighter (hold still at the end of a stroke to turn it
 * into a straight line), a stroke eraser, and a lasso that selects strokes to
 * move, recolour or delete (a tap selects the stroke under it).
 *
 * Saving: every edit marks the drawing dirty and saves after a short pause,
 * never while the pen is down. A save changes the block, so Obsidian re-renders
 * it — the session store below carries draw mode, tool, view, selection,
 * fullscreen and the undo history across that re-render, keyed by note path +
 * the block's `id:`.
 */

const SAVE_DELAY_MS = 900;
const MAX_UNDO = 100;
/** Samples closer than this to the previous one (screen px) are dropped. */
const MIN_SAMPLE_DISTANCE = 0.75;
/** Eraser and tap-select reach beyond a stroke's own half-width, in screen px. */
const HIT_RADIUS_PX = 8;
const SIZES: Record<InkKind, readonly number[]> = { pen: [3, 6, 12], highlight: [12, 20, 32] };
/** Lowest pressure a pen sample is recorded at — iOS reports 0 on the first sample. */
const MIN_PEN_PRESSURE = 0.05;
/** How long a session outlives a block that left the DOM without coming back. */
const SESSION_TTL_MS = 10_000;
/** Touches are ignored this long after the pen lifts — the palm is still down. */
const PALM_GRACE_MS = 400;
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
/** Margin around the drawing when it is fitted into the frame, in screen px. */
const FIT_PADDING_PX = 24;
/** Wheel delta (px) to zoom factor, for trackpad pinch / ctrl + wheel. */
const WHEEL_ZOOM_RATE = 0.01;
/** Holding the pen this still (screen px) for this long straightens the stroke. */
const HOLD_TOLERANCE_PX = 4;
const HOLD_MS = 550;
/** A stroke shorter than this (screen px) is never straightened — it's a dot. */
const MIN_STRAIGHT_PX = 20;
/** Spacing of the points a straightened stroke is resampled to, in world units. */
const STRAIGHT_STEP = 6;
/** A lasso enclosing at least this share of a stroke's points selects it. */
const LASSO_SHARE = 0.5;
/** A lasso shorter than this (screen px) is a tap: select the stroke under it. */
const TAP_PX = 6;
/** Pattern spacing of the paper backgrounds, in world units. */
const PAPER_STEP = 32;

const INK_FILL: Record<InkColor, string> = {
  ink: "var(--text-normal, #1f2328)",
  red: "var(--color-red, #e93147)",
  blue: "var(--color-blue, #086ddd)",
  green: "var(--color-green, #08b94e)",
  orange: "var(--color-orange, #ec7500)",
  yellow: "var(--color-yellow, #e0ac00)",
};

const COLOR_LABEL: Record<InkColor, TranslationKey> = {
  ink: "scribble.color.ink",
  red: "scribble.color.red",
  blue: "scribble.color.blue",
  green: "scribble.color.green",
  orange: "scribble.color.orange",
  yellow: "scribble.color.yellow",
};

const BACKGROUND_LABEL: Record<ScribbleBackground, TranslationKey> = {
  blank: "scribble.bg.blank",
  dots: "scribble.bg.dots",
  grid: "scribble.bg.grid",
  lines: "scribble.bg.lines",
};

type Tool = InkKind | "eraser" | "select";

/** Top-left corner of the frame in world units, and CSS px per world unit. */
interface View {
  x: number;
  y: number;
  scale: number;
}

type Box = [x0: number, y0: number, x1: number, y1: number];

interface Snapshot {
  strokes: InkStroke[];
}

interface Session {
  /** Session-store key: note path + block id. */
  key: string;
  id: string;
  strokes: InkStroke[];
  height: number;
  background: ScribbleBackground;
  undo: Snapshot[];
  redo: Snapshot[];
  tool: Tool;
  color: Record<InkKind, InkColor>;
  /** Index into SIZES[kind], shared by pen and highlighter. */
  sizeIndex: number;
  selection: Set<InkStroke>;
  drawing: boolean;
  finger: boolean;
  /** The draw-mode view; null means "fit the drawing" on the next layout. */
  view: View | null;
  fullscreen: boolean;
  /** The fullscreen layer, appended to the document body while open. */
  overlay: HTMLElement | null;
  /** Signature of the drawing the note holds (as of the last save or render). */
  saved: string;
  dirty: boolean;
  timer: number | null;
  /** A pointer is mid-gesture; saving waits for it. */
  busy: boolean;
  failShown: boolean;
  /** The latest mounted canvas for this block — the one saves resolve against. */
  el: HTMLElement;
  app: App;
  ctx: MarkdownPostProcessorContext;
  /** Repaints the latest mounted canvas after a state change. */
  refresh: () => void;
  /** Rebuilds the latest mounted canvas, inline or fullscreen. */
  relayout: () => void;
}

const sessions = new Map<string, Session>();
let paperSeq = 0;

function signature(strokes: readonly InkStroke[], height: number, background: ScribbleBackground): string {
  return `${height}\n${background}\n${strokes.map(encodeStrokeLine).join("\n")}`;
}

function newBlockId(): string {
  let id = "";
  while (id.length < 8) id += Math.random().toString(36).slice(2);
  return id.slice(0, 8);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ── Stroke geometry ───────────────────────────────────────────────────────────

/** perfect-freehand outline → closed SVG path (the library's own recipe). */
function outlineToPath(pts: number[][]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number): string => v.toFixed(1);
  const mid = (a: number[], b: number[]): string => `${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2)}`;
  if (n < 4) return `M${pts.map(p => `${f(p[0])},${f(p[1])}`).join(" L")} Z`;
  let d = `M${f(pts[0][0])},${f(pts[0][1])} Q${f(pts[1][0])},${f(pts[1][1])} ${mid(pts[1], pts[2])} T`;
  for (let i = 2; i < n - 1; i++) d += `${mid(pts[i], pts[i + 1])} `;
  return `${d}Z`;
}

function strokePathData(kind: InkKind, size: number, points: readonly InkPoint[], complete: boolean): string {
  const outline = getStroke(points as unknown as number[][], {
    size,
    // A highlighter is a flat chisel: no pressure thinning.
    thinning: kind === "highlight" ? 0 : 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: complete,
  });
  return outlineToPath(outline);
}

function createStrokePath(kind: InkKind, color: InkColor): SVGPathElement {
  const path = createSvgEl("path", { class: kind === "highlight" ? "vzd-scribble-stroke vzd-scribble-highlight" : "vzd-scribble-stroke" });
  path.style.fill = INK_FILL[color];
  // Ink is already hand-drawn: keep the sketch-mode wobble filter off it.
  path.setAttribute(FLAT_SHAPE_ATTR, "");
  return path;
}

const bounds = new WeakMap<InkStroke, Box>();

/** A stroke's box in world units, including its width. */
function strokeBounds(stroke: InkStroke): Box {
  let b = bounds.get(stroke);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of stroke.points) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
    const r = stroke.size / 2;
    b = [b[0] - r, b[1] - r, b[2] + r, b[3] + r];
    bounds.set(stroke, b);
  }
  return b;
}

function unionBounds(strokes: Iterable<InkStroke>): Box | null {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  let any = false;
  for (const st of strokes) {
    const s = strokeBounds(st);
    b[0] = Math.min(b[0], s[0]); b[1] = Math.min(b[1], s[1]);
    b[2] = Math.max(b[2], s[2]); b[3] = Math.max(b[3], s[3]);
    any = true;
  }
  return any ? b : null;
}

/** The view that shows the whole drawing in a w × h px frame, never above 100 %. */
function fitView(strokes: readonly InkStroke[], w: number, h: number): View {
  const b = unionBounds(strokes);
  if (!b) return { x: 0, y: 0, scale: 1 };
  const bw = Math.max(1, b[2] - b[0]);
  const bh = Math.max(1, b[3] - b[1]);
  const pad = 2 * FIT_PADDING_PX;
  const scale = clamp(Math.min((w - pad) / bw, (h - pad) / bh, 1), MIN_SCALE, MAX_SCALE);
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  return { x: cx - w / (2 * scale), y: cy - h / (2 * scale), scale };
}

function segmentDistanceSq(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const tt = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
  const px = ax + tt * dx - x, py = ay + tt * dy - y;
  return px * px + py * py;
}

function strokeHit(stroke: InkStroke, x: number, y: number, radius: number): boolean {
  const [x0, y0, x1, y1] = strokeBounds(stroke);
  if (x < x0 - radius || x > x1 + radius || y < y0 - radius || y > y1 + radius) return false;
  const reach = radius + stroke.size / 2;
  const r2 = reach * reach;
  const pts = stroke.points;
  if (pts.length === 1) return segmentDistanceSq(pts[0][0], pts[0][1], pts[0][0], pts[0][1], x, y) <= r2;
  for (let i = 1; i < pts.length; i++) {
    if (segmentDistanceSq(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], x, y) <= r2) return true;
  }
  return false;
}

/** Even-odd ray cast: is (x, y) inside the closed polygon? */
function insidePolygon(poly: readonly InkPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Share of a stroke's points (sampled, at most ~64) inside the lasso. */
function lassoShare(stroke: InkStroke, poly: readonly InkPoint[]): number {
  const pts = stroke.points;
  const step = Math.max(1, Math.floor(pts.length / 64));
  let n = 0, hits = 0;
  for (let i = 0; i < pts.length; i += step) {
    n++;
    if (insidePolygon(poly, pts[i][0], pts[i][1])) hits++;
  }
  return n === 0 ? 0 : hits / n;
}

/** Evenly spaced points on the segment a → b, at one pressure. */
function straightLine(a: InkPoint, b: InkPoint, pressure: number): InkPoint[] {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STRAIGHT_STEP) + 1);
  const out: InkPoint[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    out.push(quantizePoint(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, pressure));
  }
  return out;
}

function translateStroke(stroke: InkStroke, dx: number, dy: number): InkStroke {
  return { ...stroke, points: stroke.points.map(([x, y, p]) => quantizePoint(x + dx, y + dy, p)) };
}

// ── Session: state that survives the re-render a save causes ─────────────────

function scheduleSave(s: Session): void {
  s.dirty = true;
  const win = ownerWindow(s.el);
  if (s.timer !== null) win.clearTimeout(s.timer);
  s.timer = win.setTimeout(() => {
    s.timer = null;
    if (s.busy) { scheduleSave(s); return; }
    flush(s);
  }, SAVE_DELAY_MS);
}

function flush(s: Session): void {
  if (s.timer !== null) {
    ownerWindow(s.el).clearTimeout(s.timer);
    s.timer = null;
  }
  if (!s.dirty) return;
  const source = writeScribble(s.app, s.ctx, s.el, {
    id: s.id,
    height: s.height,
    background: s.background === "blank" ? null : s.background,
    strokeLines: s.strokes.map(encodeStrokeLine),
  });
  if (source === null) {
    // The strokes stay on screen and in memory; the next edit retries.
    if (!s.failShown) {
      s.failShown = true;
      new Notice(t("edit.writeFailed"));
    }
    return;
  }
  // Until Obsidian re-renders the block, the next save must still find it.
  s.el.dataset.vzSource = source;
  s.saved = signature(s.strokes, s.height, s.background);
  s.dirty = false;
  s.failShown = false;
}

function pushHistory(s: Session): void {
  s.undo.push({ strokes: s.strokes });
  if (s.undo.length > MAX_UNDO) s.undo.shift();
  s.redo = [];
}

/** Replaces the strokes (undoably), keeping the selection on what survives. */
function commitStrokes(s: Session, next: InkStroke[], selection?: Set<InkStroke>): void {
  pushHistory(s);
  s.strokes = next;
  s.selection = selection ?? new Set(next.filter(st => s.selection.has(st)));
  scheduleSave(s);
}

function stepHistory(s: Session, from: Snapshot[], to: Snapshot[]): void {
  const snap = from.pop();
  if (!snap) return;
  to.push({ strokes: s.strokes });
  s.strokes = snap.strokes;
  s.selection = new Set(s.strokes.filter(st => s.selection.has(st)));
  scheduleSave(s);
  s.refresh();
}

/**
 * The session for this block, reused when it still describes what the note
 * holds (or has unsaved edits of its own); otherwise a fresh one, so an edit
 * made in the source or on another device resets tool state and history
 * rather than being overwritten by stale strokes.
 */
function acquireSession(
  data: ScribbleData,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
): Session {
  const id = data.id ?? newBlockId();
  const key = `${ctx.sourcePath}\u0000${id}`;
  const sig = signature(data.strokes, data.height, data.background);
  const existing = sessions.get(key);
  if (existing && (existing.dirty || existing.saved === sig)) {
    existing.el = container;
    existing.app = app;
    existing.ctx = ctx;
    return existing;
  }
  if (existing) {
    if (existing.timer !== null) ownerWindow(existing.el).clearTimeout(existing.timer);
    closeOverlay(existing);
  }
  const s: Session = {
    key,
    id,
    strokes: data.strokes,
    height: data.height,
    background: data.background,
    undo: [],
    redo: [],
    tool: "pen",
    color: { pen: "ink", highlight: "yellow" },
    sizeIndex: 0,
    selection: new Set(),
    drawing: false,
    finger: false,
    view: null,
    fullscreen: false,
    overlay: null,
    saved: sig,
    dirty: false,
    timer: null,
    busy: false,
    failShown: false,
    el: container,
    app,
    ctx,
    refresh: () => {},
    relayout: () => {},
  };
  sessions.set(key, s);
  return s;
}

/**
 * The canvas `container` left the DOM. If it is still the session's latest
 * canvas, save what is pending and release the session once the block is gone
 * for good (note closed, block deleted) — a re-render puts a new canvas in
 * `s.el` well within the TTL.
 */
function releaseCanvas(s: Session, container: HTMLElement): void {
  if (s.el !== container) return;
  flush(s);
  ownerWindow(container).setTimeout(() => {
    if (s.el.isConnected || s.dirty || sessions.get(s.key) !== s) return;
    closeOverlay(s);
    sessions.delete(s.key);
  }, SESSION_TTL_MS);
}

function openOverlay(s: Session, doc: Document): HTMLElement {
  if (s.overlay?.isConnected) return s.overlay;
  const overlay = doc.createElement("div");
  overlay.className = "vzd-scribble-overlay";
  doc.body.appendChild(overlay);
  s.overlay = overlay;
  return overlay;
}

function closeOverlay(s: Session): void {
  s.overlay?.remove();
  s.overlay = null;
}

// ── Ink view: a frame onto the endless canvas ─────────────────────────────────

interface Paper {
  kind: ScribbleBackground;
  /** Draw-mode hint on blank paper: faint dots, never saved. */
  hint: boolean;
}

interface InkView {
  surface: HTMLElement;
  svg: SVGSVGElement;
  layer: SVGGElement;
  /** Selection and lasso chrome, above the ink; left out of exports. */
  ui: SVGGElement;
  /** Re-creates the paper and every stroke path. */
  paint: () => void;
  addPath: (stroke: InkStroke) => void;
  removePath: (stroke: InkStroke) => void;
  pathFor: (stroke: InkStroke) => SVGPathElement | undefined;
  /** Applies the current view to the viewBox and hides off-screen strokes. */
  applyView: () => void;
}

/** The repeating tile for a paper background, in world units. */
function paperTile(pattern: SVGPatternElement, kind: ScribbleBackground): void {
  const shape = kind === "dots"
    ? createSvgEl("circle", { cx: String(PAPER_STEP / 2), cy: String(PAPER_STEP / 2), r: "1.4", class: "vzd-scribble-paper-dot" })
    : createSvgEl("path", {
      d: kind === "grid" ? `M${PAPER_STEP} 0 L0 0 0 ${PAPER_STEP}` : `M0 ${PAPER_STEP} L${PAPER_STEP} ${PAPER_STEP}`,
      class: "vzd-scribble-paper-line",
    });
  shape.setAttribute(FLAT_SHAPE_ATTR, "");
  pattern.appendChild(shape);
}

/**
 * Builds the surface + SVG. `view(w, h)` supplies the view for a frame size;
 * until the frame has a size (a detached render, a hidden tab) the viewBox
 * simply frames the drawing, which the browser fits on its own.
 */
function createInkView(
  host: HTMLElement,
  strokes: () => readonly InkStroke[],
  view: (w: number, h: number) => View,
  paper: () => Paper,
  frameHeight: number | null,
  onView?: (v: View) => void,
): InkView {
  const surface = host.createEl("div", { cls: "vzd-scribble-surface" });
  if (frameHeight !== null) surface.style.height = `${frameHeight}px`;
  const svg = createSvgEl("svg", { class: "vzd-scribble-svg", preserveAspectRatio: "xMidYMid meet" });
  const patternId = `vzd-scribble-paper-${++paperSeq}`;
  const defs = createSvgEl("defs");
  const pattern = createSvgEl("pattern", {
    id: patternId,
    patternUnits: "userSpaceOnUse",
    width: String(PAPER_STEP),
    height: String(PAPER_STEP),
  });
  defs.appendChild(pattern);
  const sheet = createSvgEl("rect", { class: "vzd-scribble-paper", fill: `url(#${patternId})` });
  sheet.setAttribute(FLAT_SHAPE_ATTR, "");
  const layer = createSvgEl("g", { class: "vzd-scribble-layer" });
  const ui = createSvgEl("g", { class: "vzd-scribble-ui" });
  svg.append(defs, sheet, layer, ui);
  surface.appendChild(svg);
  const paths = new Map<InkStroke, SVGPathElement>();

  const cull = (box: Box): void => {
    for (const [stroke, path] of paths) {
      const b = strokeBounds(stroke);
      const visible = b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];
      path.style.display = visible ? "" : "none";
    }
  };

  const applyView = (): void => {
    const w = surface.clientWidth, h = surface.clientHeight;
    const v = w > 0 && h > 0 ? view(w, h) : null;
    let box: Box;
    if (v) {
      box = [v.x, v.y, v.x + w / v.scale, v.y + h / v.scale];
      onView?.(v);
    } else {
      const b = unionBounds(strokes()) ?? [0, 0, 800, frameHeight ?? 480];
      box = [b[0] - FIT_PADDING_PX, b[1] - FIT_PADDING_PX, b[2] + FIT_PADDING_PX, b[3] + FIT_PADDING_PX];
    }
    const [x, y, bw, bh] = [box[0], box[1], box[2] - box[0], box[3] - box[1]];
    svg.setAttribute("viewBox", `${x.toFixed(2)} ${y.toFixed(2)} ${bw.toFixed(2)} ${bh.toFixed(2)}`);
    // The sheet covers whatever is in view; meet may letterbox, so pad it.
    sheet.setAttribute("x", String(x - bw));
    sheet.setAttribute("y", String(y - bh));
    sheet.setAttribute("width", String(3 * bw));
    sheet.setAttribute("height", String(3 * bh));
    if (v) cull(box);
  };

  const addPath = (stroke: InkStroke): void => {
    const path = createStrokePath(stroke.kind, stroke.color);
    path.setAttribute("d", strokePathData(stroke.kind, stroke.size, stroke.points, true));
    layer.appendChild(path);
    paths.set(stroke, path);
  };

  const removePath = (stroke: InkStroke): void => {
    paths.get(stroke)?.remove();
    paths.delete(stroke);
  };

  const paint = (): void => {
    const p = paper();
    pattern.replaceChildren();
    if (p.kind !== "blank") paperTile(pattern, p.kind);
    else if (p.hint) paperTile(pattern, "dots");
    sheet.style.display = p.kind === "blank" && !p.hint ? "none" : "";
    sheet.classList.toggle("vzd-scribble-paper--hint", p.kind === "blank" && p.hint);
    layer.replaceChildren();
    paths.clear();
    for (const stroke of strokes()) addPath(stroke);
    applyView();
  };

  const RO = (host.ownerDocument.defaultView ?? window).ResizeObserver;
  if (typeof RO === "function") {
    const ro = new RO(() => {
      if (!surface.isConnected) { ro.disconnect(); return; }
      applyView();
    });
    ro.observe(surface);
  }

  return { surface, svg, layer, ui, paint, addPath, removePath, pathFor: (st) => paths.get(st), applyView };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export function renderScribble(
  data: ScribbleData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Scribble";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "scribble", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const host = container.createEl("div", { cls: "vzd-scribble-wrap" });
  const ariaLabel = (n: number): string => t("scribble.ariaLabel", { title, count: n });

  if (!isEditMode) {
    renderStatic(host, data.strokes, data.height, data.background, t("scribble.emptyReadOnly"), ariaLabel);
    return;
  }

  const s = acquireSession(data, container, app!, ctx!);
  const doc = container.ownerDocument;

  const layout = (): void => {
    host.replaceChildren();
    if (s.fullscreen) {
      // The note keeps a fitted picture; the editor lives in the overlay.
      renderStatic(host, s.strokes, s.height, s.background, t("scribble.emptyEdit"), ariaLabel);
      const overlay = openOverlay(s, doc);
      overlay.replaceChildren();
      s.refresh = mountEditor(overlay, s, null, ariaLabel);
    } else {
      closeOverlay(s);
      s.refresh = mountEditor(host, s, s.height, ariaLabel);
    }
  };
  s.relayout = layout;
  layout();

  // iOS can suspend the app the moment it is backgrounded; save first.
  const onVisibility = (): void => { if (doc.visibilityState === "hidden") flush(s); };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !s.fullscreen || s.el !== container) return;
    e.preventDefault();
    s.fullscreen = false;
    s.relayout();
  };
  doc.addEventListener("visibilitychange", onVisibility);
  doc.addEventListener("keydown", onKey);
  onDisconnected(container, () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    doc.removeEventListener("keydown", onKey);
    releaseCanvas(s, container);
  });
}

/** A read-only, fitted picture of the drawing. */
function renderStatic(
  host: HTMLElement,
  strokes: readonly InkStroke[],
  height: number,
  background: ScribbleBackground,
  emptyText: string,
  ariaLabel: (n: number) => string,
): void {
  const iv = createInkView(host, () => strokes, (w, h) => fitView(strokes, w, h), () => ({ kind: background, hint: false }), height);
  iv.svg.setAttribute("role", "img");
  iv.svg.setAttribute("aria-label", ariaLabel(strokes.length));
  iv.paint();
  if (strokes.length === 0) iv.surface.createEl("div", { cls: "vzd-scribble-empty", text: emptyText });
}

/**
 * The interactive canvas: toolbar + surface, inline (`frameHeight` px tall)
 * or filling the fullscreen overlay (`frameHeight` null). Returns the repaint
 * function the session calls after undo / redo.
 */
function mountEditor(
  host: HTMLElement,
  s: Session,
  frameHeight: number | null,
  ariaLabel: (n: number) => string,
): () => void {
  const toolbar = host.createEl("div", { cls: "vzd-scribble-toolbar" });
  let zoomLabel: HTMLElement | null = null;

  const view = (w: number, h: number): View => {
    if (!s.drawing) return fitView(s.strokes, w, h);
    s.view ??= fitView(s.strokes, w, h);
    return s.view;
  };
  const iv = createInkView(host, () => s.strokes, view, () => ({ kind: s.background, hint: s.drawing }), frameHeight, (v) => {
    zoomLabel?.setText(`${Math.round(v.scale * 100)}%`);
    drawSelection();
  });
  const { surface, svg, layer, ui } = iv;
  svg.setAttribute("role", "img");
  const empty = surface.createEl("div", { cls: "vzd-scribble-empty", text: t("scribble.emptyEdit") });
  const win = ownerWindow(host);

  let frame: number | null = null;
  const scheduleView = (): void => {
    if (frame !== null) return;
    frame = win.requestAnimationFrame(() => { frame = null; iv.applyView(); });
  };

  /** The live draw-mode view, created from the frame's size when missing. */
  const liveView = (): View | null => {
    const r = surface.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return view(r.width, r.height);
  };

  const zoomAt = (px: number, py: number, factor: number): void => {
    const v = liveView();
    if (!v) return;
    const next = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
    const wx = v.x + px / v.scale;
    const wy = v.y + py / v.scale;
    v.x = wx - px / next;
    v.y = wy - py / next;
    v.scale = next;
    scheduleView();
  };

  const panBy = (dx: number, dy: number): void => {
    const v = liveView();
    if (!v) return;
    v.x -= dx / v.scale;
    v.y -= dy / v.scale;
    scheduleView();
  };

  const zoomCentered = (factor: number): void => {
    zoomAt(surface.clientWidth / 2, surface.clientHeight / 2, factor);
  };

  // ── Selection chrome ────────────────────────────────────────────────────
  const selectionBox = createSvgEl("rect", { class: "vzd-scribble-selection", "vector-effect": "non-scaling-stroke" });
  selectionBox.setAttribute(FLAT_SHAPE_ATTR, "");

  /** The selection's box in world units, padded by a few screen px. */
  const selectionBounds = (): Box | null => {
    const b = unionBounds(s.selection);
    if (!b) return null;
    const pad = 6 / (liveView()?.scale ?? 1);
    return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
  };

  function drawSelection(): void {
    const b = s.drawing && s.tool === "select" ? selectionBounds() : null;
    if (!b) { selectionBox.remove(); return; }
    selectionBox.setAttribute("x", String(b[0]));
    selectionBox.setAttribute("y", String(b[1]));
    selectionBox.setAttribute("width", String(b[2] - b[0]));
    selectionBox.setAttribute("height", String(b[3] - b[1]));
    selectionBox.removeAttribute("transform");
    if (!selectionBox.isConnected) ui.appendChild(selectionBox);
  }

  const syncState = (): void => {
    surface.toggleClass("vzd-scribble-surface--drawing", s.drawing);
    surface.toggleClass("vzd-scribble-surface--eraser", s.drawing && s.tool === "eraser");
    surface.toggleClass("vzd-scribble-surface--select", s.drawing && s.tool === "select");
    svg.setAttribute("aria-label", ariaLabel(s.strokes.length));
    empty.toggleClass("vzd-scribble-empty--hidden", s.strokes.length > 0 || s.drawing);
    for (const st of s.strokes) iv.pathFor(st)?.classList.toggle("vzd-scribble-stroke--selected", s.selection.has(st));
    drawSelection();
  };

  const setTool = (tool: Tool): void => {
    s.tool = tool;
    if (tool !== "select") s.selection = new Set();
    refresh();
  };

  // ── Toolbar ─────────────────────────────────────────────────────────────
  const button = (parent: HTMLElement, icon: string, label: string, onClick: () => void, active = false): HTMLButtonElement => {
    const btn = parent.createEl("button", { cls: "vzd-btn vzd-scribble-btn" });
    setIcon(btn, icon);
    btn.setAttribute("aria-label", label);
    btn.toggleClass("vzd-scribble-btn--active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return btn;
  };

  const renderToolbar = (): void => {
    toolbar.empty();
    zoomLabel = null;
    const main = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    const toggle = button(main, s.drawing ? "check" : "pencil", t(s.drawing ? "scribble.done" : "scribble.draw"), () => {
      s.drawing = !s.drawing;
      s.view = null;
      s.selection = new Set();
      if (!s.drawing) flush(s);
      refresh();
    }, s.drawing);
    toggle.addClass("vzd-scribble-btn--primary");
    toggle.createEl("span", { cls: "vzd-scribble-btn-text", text: t(s.drawing ? "scribble.done" : "scribble.draw") });
    button(main, s.fullscreen ? "minimize-2" : "maximize-2", t(s.fullscreen ? "scribble.exitFullscreen" : "scribble.fullscreen"), () => {
      s.fullscreen = !s.fullscreen;
      if (s.fullscreen) s.drawing = true;
      s.relayout();
    });
    if (!s.drawing) return;

    const tools = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(tools, "pen-tool", t("scribble.pen"), () => setTool("pen"), s.tool === "pen");
    button(tools, "highlighter", t("scribble.highlighter"), () => setTool("highlight"), s.tool === "highlight");
    button(tools, "eraser", t("scribble.eraser"), () => setTool("eraser"), s.tool === "eraser");
    button(tools, "lasso", t("scribble.select"), () => setTool("select"), s.tool === "select");

    // Swatches set the pen / highlighter colour, or recolour the selection.
    const recolouring = s.tool === "select" && s.selection.size > 0;
    const inkKind: InkKind | null = s.tool === "pen" || s.tool === "highlight" ? s.tool : null;
    if (inkKind || recolouring) {
      const colors = toolbar.createEl("div", { cls: "vzd-scribble-group" });
      for (const color of INK_COLORS) {
        const sw = colors.createEl("button", { cls: "vzd-btn vzd-scribble-swatch" });
        sw.style.setProperty("--vzd-scribble-swatch", INK_FILL[color]);
        sw.setAttribute("aria-label", recolouring ? t("scribble.recolor", { color: t(COLOR_LABEL[color]) }) : t(COLOR_LABEL[color]));
        const on = inkKind !== null && s.color[inkKind] === color;
        sw.toggleClass("vzd-scribble-swatch--active", on);
        sw.setAttribute("aria-pressed", String(on));
        sw.addEventListener("click", (e) => {
          e.stopPropagation();
          if (inkKind) {
            s.color[inkKind] = color;
          } else {
            const recoloured = new Set<InkStroke>();
            const next = s.strokes.map(st => {
              if (!s.selection.has(st)) return st;
              const c = { ...st, color };
              recoloured.add(c);
              return c;
            });
            commitStrokes(s, next, recoloured);
          }
          refresh();
        });
      }
    }

    if (inkKind) {
      const sizes = toolbar.createEl("div", { cls: "vzd-scribble-group" });
      SIZES[inkKind].forEach((size, i) => {
        const btn = sizes.createEl("button", { cls: "vzd-btn vzd-scribble-size" });
        btn.setAttribute("aria-label", t("scribble.size", { size }));
        const on = s.sizeIndex === i;
        btn.toggleClass("vzd-scribble-size--active", on);
        btn.setAttribute("aria-pressed", String(on));
        const dot = btn.createEl("span", { cls: "vzd-scribble-dot" });
        dot.style.width = dot.style.height = `${Math.min(18, 3 + size / (inkKind === "highlight" ? 2 : 1))}px`;
        btn.addEventListener("click", (e) => { e.stopPropagation(); s.sizeIndex = i; refresh(); });
      });
    }

    if (recolouring) {
      const sel = toolbar.createEl("div", { cls: "vzd-scribble-group" });
      button(sel, "trash", t("scribble.deleteSelection", { count: s.selection.size }), () => {
        commitStrokes(s, s.strokes.filter(st => !s.selection.has(st)), new Set());
        refresh();
      });
    }

    const history = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(history, "undo-2", t("scribble.undo"), () => stepHistory(s, s.undo, s.redo)).disabled = s.undo.length === 0;
    button(history, "redo-2", t("scribble.redo"), () => stepHistory(s, s.redo, s.undo)).disabled = s.redo.length === 0;

    const zoom = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(zoom, "zoom-out", t("scribble.zoomOut"), () => zoomCentered(1 / ZOOM_STEP));
    const label = zoom.createEl("button", { cls: "vzd-btn vzd-scribble-zoom" });
    label.setAttribute("aria-label", t("scribble.zoomReset"));
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      const v = liveView();
      if (v) zoomCentered(1 / v.scale);
    });
    zoomLabel = label;
    button(zoom, "zoom-in", t("scribble.zoomIn"), () => zoomCentered(ZOOM_STEP));
    button(zoom, "scan", t("scribble.fit"), () => { s.view = null; iv.applyView(); });

    const extra = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(extra, "layout-grid", t("scribble.background", { name: t(BACKGROUND_LABEL[s.background]) }), () => {
      s.background = SCRIBBLE_BACKGROUNDS[(SCRIBBLE_BACKGROUNDS.indexOf(s.background) + 1) % SCRIBBLE_BACKGROUNDS.length];
      scheduleSave(s);
      refresh();
    }, s.background !== "blank");
    button(extra, "hand", t("scribble.finger"), () => { s.finger = !s.finger; refresh(); }, s.finger);
    button(extra, "trash-2", t("scribble.clear"), () => {
      if (s.strokes.length === 0) return;
      commitStrokes(s, [], new Set());
      refresh();
    }).disabled = s.strokes.length === 0;
  };

  const refresh = (): void => {
    renderToolbar();
    iv.paint();
    syncState();
  };
  refresh();

  // ── Pointer input ───────────────────────────────────────────────────────
  interface DrawGesture {
    kind: "draw";
    pointerId: number;
    ink: InkKind;
    points: InkPoint[];
    path: SVGPathElement;
    pen: boolean;
    frame: number | null;
    /** Turned into a straight line by holding still; the end follows the pointer. */
    straight: boolean;
    hold: { x: number; y: number; timer: number | null };
  }
  type Gesture =
    | DrawGesture
    | { kind: "erase"; pointerId: number; erased: boolean }
    | { kind: "pan"; pointerId: number; x: number; y: number }
    | { kind: "lasso"; pointerId: number; points: InkPoint[]; line: SVGPolylineElement; startX: number; startY: number; far: boolean }
    | { kind: "move"; pointerId: number; from: InkPoint; dx: number; dy: number };
  let gesture: Gesture | null = null;
  /** Fingers on the surface (client coords), for one-finger pan and pinch. */
  const touches = new Map<number, { x: number; y: number }>();
  let lastPenUp = -Infinity;
  let strokeCapShown = false;

  const toWorld = (e: PointerEvent, pen: boolean): InkPoint | null => {
    const v = liveView();
    if (!v) return null;
    const r = surface.getBoundingClientRect();
    const pressure = pen ? Math.max(MIN_PEN_PRESSURE, e.pressure) : 0.5;
    return quantizePoint(v.x + (e.clientX - r.left) / v.scale, v.y + (e.clientY - r.top) / v.scale, pressure);
  };

  const drawLive = (g: DrawGesture): void => {
    g.frame = null;
    g.path.setAttribute("d", strokePathData(g.ink, SIZES[g.ink][s.sizeIndex], g.points, false));
  };

  /**
   * Straightens the stroke once the pointer has been held still for HOLD_MS:
   * every move beyond HOLD_TOLERANCE_PX restarts the countdown.
   */
  const armHold = (g: DrawGesture, e: PointerEvent): void => {
    if (g.straight) return;
    if (g.hold.timer !== null && Math.hypot(e.clientX - g.hold.x, e.clientY - g.hold.y) <= HOLD_TOLERANCE_PX) return;
    if (g.hold.timer !== null) win.clearTimeout(g.hold.timer);
    g.hold = { x: e.clientX, y: e.clientY, timer: null };
    g.hold.timer = win.setTimeout(() => {
      g.hold.timer = null;
      const v = liveView();
      const first = g.points[0], last = g.points[g.points.length - 1];
      if (gesture !== g || !v || !first || !last) return;
      if (Math.hypot(last[0] - first[0], last[1] - first[1]) * v.scale < MIN_STRAIGHT_PX) return;
      const pressure = g.points.reduce((sum, p) => sum + p[2], 0) / g.points.length;
      g.straight = true;
      g.points = straightLine(first, last, pressure);
      drawLive(g);
    }, HOLD_MS);
  };

  const eraseAt = (g: Extract<Gesture, { kind: "erase" }>, e: PointerEvent): void => {
    const p = toWorld(e, false);
    const v = liveView();
    if (!p || !v) return;
    const radius = HIT_RADIUS_PX / v.scale;
    const hit = s.strokes.filter(st => strokeHit(st, p[0], p[1], radius));
    if (hit.length === 0) return;
    if (!g.erased) { pushHistory(s); g.erased = true; }
    const gone = new Set(hit);
    for (const st of hit) iv.removePath(st);
    s.strokes = s.strokes.filter(st => !gone.has(st));
  };

  const sample = (e: PointerEvent): void => {
    if (!gesture) return;
    switch (gesture.kind) {
      case "erase":
        eraseAt(gesture, e);
        return;
      case "pan":
        panBy(e.clientX - gesture.x, e.clientY - gesture.y);
        gesture.x = e.clientX;
        gesture.y = e.clientY;
        return;
      case "lasso": {
        const p = toWorld(e, false);
        if (!p) return;
        gesture.points.push(p);
        if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > TAP_PX) gesture.far = true;
        gesture.line.setAttribute("points", gesture.points.map(q => `${q[0]},${q[1]}`).join(" "));
        return;
      }
      case "move": {
        const p = toWorld(e, false);
        if (!p) return;
        gesture.dx = p[0] - gesture.from[0];
        gesture.dy = p[1] - gesture.from[1];
        const tf = `translate(${gesture.dx} ${gesture.dy})`;
        for (const st of s.selection) iv.pathFor(st)?.setAttribute("transform", tf);
        selectionBox.setAttribute("transform", tf);
        return;
      }
      case "draw": {
        const g = gesture;
        const p = toWorld(e, g.pen);
        if (!p) return;
        if (g.straight) {
          g.points = straightLine(g.points[0], p, g.points[0][2]);
          return;
        }
        if (g.points.length >= MAX_POINTS_PER_STROKE) return;
        const prev = g.points[g.points.length - 1];
        const minGap = MIN_SAMPLE_DISTANCE / (liveView()?.scale ?? 1);
        if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < minGap) return;
        g.points.push(p);
        return;
      }
    }
  };

  const finishLasso = (g: Extract<Gesture, { kind: "lasso" }>): void => {
    g.line.remove();
    const v = liveView();
    if (!v) return;
    if (!g.far) {
      // A tap: select the topmost stroke under it, or clear the selection.
      const p = g.points[0];
      const radius = HIT_RADIUS_PX / v.scale;
      const top = p ? [...s.strokes].reverse().find(st => strokeHit(st, p[0], p[1], radius)) : undefined;
      s.selection = new Set(top ? [top] : []);
    } else {
      s.selection = new Set(s.strokes.filter(st => lassoShare(st, g.points) >= LASSO_SHARE));
    }
  };

  const finishMove = (g: Extract<Gesture, { kind: "move" }>): void => {
    if (Math.abs(g.dx) < 0.5 && Math.abs(g.dy) < 0.5) return;
    const moved = new Set<InkStroke>();
    const next = s.strokes.map(st => {
      if (!s.selection.has(st)) return st;
      const m = translateStroke(st, g.dx, g.dy);
      moved.add(m);
      return m;
    });
    commitStrokes(s, next, moved);
  };

  const endGesture = (commit: boolean): void => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    s.busy = false;
    try { surface.releasePointerCapture(g.pointerId); } catch { /* capture already gone */ }
    switch (g.kind) {
      case "pan":
        return;
      case "erase":
        if (g.erased) { scheduleSave(s); renderToolbar(); syncState(); }
        return;
      case "lasso":
        finishLasso(g);
        renderToolbar();
        syncState();
        return;
      case "move":
        if (commit) finishMove(g);
        refresh();
        return;
      case "draw": {
        if (g.hold.timer !== null) win.clearTimeout(g.hold.timer);
        if (g.frame !== null) win.cancelAnimationFrame(g.frame);
        g.path.remove();
        if (!commit || g.points.length === 0) return;
        const stroke: InkStroke = { kind: g.ink, color: s.color[g.ink], size: SIZES[g.ink][s.sizeIndex], points: g.points };
        commitStrokes(s, [...s.strokes, stroke]);
        iv.addPath(stroke);
        renderToolbar();
        syncState();
        iv.applyView();
        return;
      }
    }
  };

  const startTool = (e: PointerEvent, pen: boolean): void => {
    // Surface / Wacom pens report the eraser end as button 5 (buttons bit 32).
    const tool: Tool = pen && (e.buttons & 32) !== 0 ? "eraser" : s.tool;
    if ((tool === "pen" || tool === "highlight") && s.strokes.length >= SCRIBBLE_MAX_STROKES) {
      if (!strokeCapShown) { strokeCapShown = true; new Notice(t("scribble.strokeCap", { max: SCRIBBLE_MAX_STROKES })); }
      return;
    }
    try { surface.setPointerCapture(e.pointerId); } catch { /* not capturable (synthetic event) */ }
    s.busy = true;
    if (tool === "eraser") {
      gesture = { kind: "erase", pointerId: e.pointerId, erased: false };
      sample(e);
      return;
    }
    if (tool === "select") {
      const p = toWorld(e, false);
      const b = selectionBounds();
      if (p && b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) {
        gesture = { kind: "move", pointerId: e.pointerId, from: p, dx: 0, dy: 0 };
        return;
      }
      const line = createSvgEl("polyline", { class: "vzd-scribble-lasso", "vector-effect": "non-scaling-stroke" });
      line.setAttribute(FLAT_SHAPE_ATTR, "");
      ui.appendChild(line);
      gesture = { kind: "lasso", pointerId: e.pointerId, points: [], line, startX: e.clientX, startY: e.clientY, far: false };
      sample(e);
      return;
    }
    const path = createStrokePath(tool, s.color[tool]);
    layer.appendChild(path);
    const g: DrawGesture = {
      kind: "draw", pointerId: e.pointerId, ink: tool, points: [], path, pen, frame: null,
      straight: false, hold: { x: e.clientX, y: e.clientY, timer: null },
    };
    gesture = g;
    sample(e);
    drawLive(g);
  };

  surface.addEventListener("pointerdown", (e) => {
    if (!s.drawing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === "pen") {
      if (gesture) return;
      // The pen wins: a palm that landed first must not keep panning.
      touches.clear();
      startTool(e, true);
      return;
    }
    if (e.pointerType === "touch") {
      // The pen or the mouse is busy: this touch is a palm or a stray finger.
      if (gesture && gesture.kind !== "pan" && !touches.has(gesture.pointerId)) return;
      if (performance.now() - lastPenUp < PALM_GRACE_MS) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { surface.setPointerCapture(e.pointerId); } catch { /* not capturable (synthetic event) */ }
      if (touches.size === 1 && s.finger && !gesture) startTool(e, false);
      // A second finger turns a finger gesture into a pinch.
      else if (touches.size === 2 && gesture) endGesture(false);
      return;
    }
    if (gesture) return;
    if (e.button === 1) {
      try { surface.setPointerCapture(e.pointerId); } catch { /* not capturable (synthetic event) */ }
      gesture = { kind: "pan", pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
      startTool(e, false);
    }
  });

  surface.addEventListener("pointermove", (e) => {
    if (gesture && e.pointerId === gesture.pointerId) {
      e.preventDefault();
      // Keep a finger's position current, so a second finger pinches from where it is.
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const coalesce = gesture.kind === "draw" && typeof e.getCoalescedEvents === "function";
      const events = coalesce ? e.getCoalescedEvents() : [];
      for (const ev of events.length > 0 ? events : [e]) sample(ev);
      if (gesture.kind === "draw") {
        const g = gesture;
        armHold(g, e);
        if (g.frame === null) g.frame = win.requestAnimationFrame(() => drawLive(g));
      }
      return;
    }
    const prev = touches.get(e.pointerId);
    if (!prev || gesture) return;
    e.preventDefault();
    const next = { x: e.clientX, y: e.clientY };
    if (touches.size === 1) {
      panBy(next.x - prev.x, next.y - prev.y);
    } else if (touches.size === 2) {
      const other = [...touches].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const r = surface.getBoundingClientRect();
        const c0 = { x: (prev.x + other.x) / 2 - r.left, y: (prev.y + other.y) / 2 - r.top };
        const c1 = { x: (next.x + other.x) / 2 - r.left, y: (next.y + other.y) / 2 - r.top };
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(next.x - other.x, next.y - other.y);
        if (d0 > 0) zoomAt(c0.x, c0.y, d1 / d0);
        panBy(c1.x - c0.x, c1.y - c0.y);
      }
    }
    touches.set(e.pointerId, next);
  });

  const lift = (e: PointerEvent, commit: boolean): void => {
    touches.delete(e.pointerId);
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (e.pointerType === "pen") lastPenUp = performance.now();
    endGesture(commit);
  };
  surface.addEventListener("pointerup", (e) => lift(e, true));
  surface.addEventListener("pointercancel", (e) => lift(e, false));

  // Trackpad: two-finger scroll pans, pinch (ctrl + wheel) zooms. Draw mode only —
  // otherwise the wheel scrolls the note as usual.
  surface.addEventListener("wheel", (e) => {
    if (!s.drawing) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      const r = surface.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * unit * WHEEL_ZOOM_RATE));
    } else {
      panBy(-e.deltaX * unit, -e.deltaY * unit);
    }
  }, { passive: false });

  // In draw mode every touch belongs to the canvas: no note scrolling, no iOS
  // Scribble handwriting, no page pinch-zoom (WebKit's gesture events).
  const blockTouch = (e: Event): void => { if (s.drawing) e.preventDefault(); };
  surface.addEventListener("touchstart", blockTouch, { passive: false });
  surface.addEventListener("touchmove", blockTouch, { passive: false });
  surface.addEventListener("gesturestart", blockTouch);
  surface.addEventListener("gesturechange", blockTouch);
  // A click in draw mode must not reach the editor and move the cursor into the block.
  surface.addEventListener("click", (e) => { if (s.drawing) e.stopPropagation(); });

  return refresh;
}
