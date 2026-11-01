import { getStroke } from "perfect-freehand";
import { Notice, setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { InkColor, InkPoint, InkStroke, ScribbleData } from "../types/scribble";
import { INK_COLORS } from "../types/scribble";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl, FLAT_SHAPE_ATTR } from "../shared/svg";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { encodeStroke, encodeStrokeLine, MAX_POINTS_PER_STROKE, quantizePoint, SCRIBBLE_WIDTH } from "../shared/ink-codec";
import { writeScribble } from "../shared/scribble-edit";
import { SCRIBBLE_MAX_HEIGHT, SCRIBBLE_MAX_STROKES } from "../scribble";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n/locales/en";

/**
 * Scribble canvas: freehand ink drawn with a pen, stored as `stroke:` lines in
 * the block itself (see shared/ink-codec.ts for the encoding).
 *
 * Input policy, tuned for iPad + Apple Pencil: outside draw mode the canvas is
 * a static picture and the note scrolls over it. In draw mode the pen and a
 * mouse draw; a finger still scrolls the note (palm rejection for free),
 * unless "Draw with finger" is switched on. Pencil touches are cancelled at
 * `touchstart`, which is what keeps iOS from turning a pen stroke into a
 * scroll and firing `pointercancel` halfway through it.
 *
 * Saving: every edit marks the drawing dirty and saves after a short pause,
 * never while the pen is down. A save changes the block, so Obsidian re-renders
 * it — the session store below carries draw mode, the chosen tool and the
 * undo history across that re-render, keyed by note path + the block's `id:`.
 */

const SAVE_DELAY_MS = 900;
const MAX_UNDO = 100;
const HEIGHT_STEP = 240;
/** Samples closer than this to the previous one (logical units) are dropped. */
const MIN_SAMPLE_DISTANCE = 0.75;
/** Eraser reach beyond a stroke's own half-width, in logical units. */
const ERASER_RADIUS = 8;
const PEN_SIZES = [3, 6, 12] as const;
/** Lowest pressure a pen sample is recorded at — iOS reports 0 on the first sample. */
const MIN_PEN_PRESSURE = 0.05;
/** How long a session outlives a block that left the DOM without coming back. */
const SESSION_TTL_MS = 10_000;

const INK_FILL: Record<InkColor, string> = {
  ink: "var(--text-normal, #1f2328)",
  red: "var(--color-red, #e93147)",
  blue: "var(--color-blue, #086ddd)",
  green: "var(--color-green, #08b94e)",
  orange: "var(--color-orange, #ec7500)",
};

const COLOR_LABEL: Record<InkColor, TranslationKey> = {
  ink: "scribble.color.ink",
  red: "scribble.color.red",
  blue: "scribble.color.blue",
  green: "scribble.color.green",
  orange: "scribble.color.orange",
};

type Tool = "pen" | "eraser";

interface Snapshot {
  strokes: InkStroke[];
  height: number;
}

interface Session {
  /** Session-store key: note path + block id. */
  key: string;
  id: string;
  strokes: InkStroke[];
  height: number;
  undo: Snapshot[];
  redo: Snapshot[];
  tool: Tool;
  color: InkColor;
  size: number;
  drawing: boolean;
  finger: boolean;
  /** Signature of the drawing the note holds (as of the last save or render). */
  saved: string;
  dirty: boolean;
  timer: number | null;
  /** A pointer is mid-stroke or mid-erase; saving waits for it. */
  busy: boolean;
  failShown: boolean;
  /** The latest mounted canvas for this block — the one saves resolve against. */
  el: HTMLElement;
  app: App;
  ctx: MarkdownPostProcessorContext;
  /** Re-renders the latest mounted canvas after a state change. */
  refresh: () => void;
}

const sessions = new Map<string, Session>();

function signature(strokes: readonly InkStroke[], height: number): string {
  return `${height}\n${strokes.map(encodeStroke).join("\n")}`;
}

function newBlockId(): string {
  let id = "";
  while (id.length < 8) id += Math.random().toString(36).slice(2);
  return id.slice(0, 8);
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

function strokePathData(size: number, points: readonly InkPoint[], complete: boolean): string {
  const outline = getStroke(points as unknown as number[][], {
    size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: complete,
  });
  return outlineToPath(outline);
}

function createStrokePath(color: InkColor): SVGPathElement {
  const path = createSvgEl("path", { class: "vzd-scribble-stroke" });
  path.style.fill = INK_FILL[color];
  // Ink is already hand-drawn: keep the sketch-mode wobble filter off it.
  path.setAttribute(FLAT_SHAPE_ATTR, "");
  return path;
}

const bounds = new WeakMap<InkStroke, [number, number, number, number]>();

function strokeBounds(stroke: InkStroke): [number, number, number, number] {
  let b = bounds.get(stroke);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of stroke.points) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
    bounds.set(stroke, b);
  }
  return b;
}

function segmentDistanceSq(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const tt = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
  const px = ax + tt * dx - x, py = ay + tt * dy - y;
  return px * px + py * py;
}

function strokeHit(stroke: InkStroke, x: number, y: number): boolean {
  const reach = ERASER_RADIUS + stroke.size / 2;
  const [x0, y0, x1, y1] = strokeBounds(stroke);
  if (x < x0 - reach || x > x1 + reach || y < y0 - reach || y > y1 + reach) return false;
  const pts = stroke.points;
  const r2 = reach * reach;
  if (pts.length === 1) return segmentDistanceSq(pts[0][0], pts[0][1], pts[0][0], pts[0][1], x, y) <= r2;
  for (let i = 1; i < pts.length; i++) {
    if (segmentDistanceSq(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], x, y) <= r2) return true;
  }
  return false;
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
  s.saved = signature(s.strokes, s.height);
  s.dirty = false;
  s.failShown = false;
}

function pushHistory(s: Session): void {
  s.undo.push({ strokes: s.strokes, height: s.height });
  if (s.undo.length > MAX_UNDO) s.undo.shift();
  s.redo = [];
}

function stepHistory(s: Session, from: Snapshot[], to: Snapshot[]): void {
  const snap = from.pop();
  if (!snap) return;
  to.push({ strokes: s.strokes, height: s.height });
  s.strokes = snap.strokes;
  s.height = snap.height;
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
  const sig = signature(data.strokes, data.height);
  const existing = sessions.get(key);
  if (existing && (existing.dirty || existing.saved === sig)) {
    existing.el = container;
    existing.app = app;
    existing.ctx = ctx;
    return existing;
  }
  if (existing && existing.timer !== null) ownerWindow(existing.el).clearTimeout(existing.timer);
  const s: Session = {
    key,
    id,
    strokes: data.strokes,
    height: data.height,
    undo: [],
    redo: [],
    tool: "pen",
    color: "ink",
    size: PEN_SIZES[0],
    drawing: false,
    finger: false,
    saved: sig,
    dirty: false,
    timer: null,
    busy: false,
    failShown: false,
    el: container,
    app,
    ctx,
    refresh: () => {},
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
    if (!s.el.isConnected && !s.dirty && sessions.get(s.key) === s) sessions.delete(s.key);
  }, SESSION_TTL_MS);
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

  const s = isEditMode ? acquireSession(data, container, app!, ctx!) : null;
  const strokes = (): InkStroke[] => s?.strokes ?? data.strokes;
  const height = (): number => s?.height ?? data.height;

  const toolbar = s ? container.createEl("div", { cls: "vzd-scribble-toolbar" }) : null;
  const wrap = container.createEl("div", { cls: "vzd-scribble-wrap" });
  const surface = wrap.createEl("div", { cls: "vzd-scribble-surface" });
  const svg = createSvgEl("svg", { class: "vzd-scribble-svg", role: "img" });
  const layer = createSvgEl("g", { class: "vzd-scribble-layer" });
  svg.appendChild(layer);
  surface.appendChild(svg);
  const empty = surface.createEl("div", { cls: "vzd-scribble-empty" });

  const paths = new Map<InkStroke, SVGPathElement>();

  const addPath = (stroke: InkStroke): void => {
    const path = createStrokePath(stroke.color);
    path.setAttribute("d", strokePathData(stroke.size, stroke.points, true));
    layer.appendChild(path);
    paths.set(stroke, path);
  };

  const syncFrame = (): void => {
    const h = height();
    svg.setAttribute("viewBox", `0 0 ${SCRIBBLE_WIDTH} ${h}`);
    svg.style.aspectRatio = `${SCRIBBLE_WIDTH} / ${h}`;
    svg.setAttribute("aria-label", t("scribble.ariaLabel", { title, count: strokes().length }));
    const isEmpty = strokes().length === 0 && !s?.drawing;
    empty.toggleClass("vzd-scribble-empty--hidden", !isEmpty);
    empty.setText(t(s ? "scribble.emptyEdit" : "scribble.emptyReadOnly"));
  };

  const renderStrokes = (): void => {
    layer.replaceChildren();
    paths.clear();
    for (const stroke of strokes()) addPath(stroke);
    syncFrame();
  };

  renderStrokes();
  if (!s || !toolbar) return;

  // ── Toolbar ─────────────────────────────────────────────────────────────
  const button = (parent: HTMLElement, icon: string, label: TranslationKey, onClick: () => void, active = false): HTMLButtonElement => {
    const btn = parent.createEl("button", { cls: "vzd-btn vzd-scribble-btn" });
    setIcon(btn, icon);
    btn.setAttribute("aria-label", t(label));
    btn.toggleClass("vzd-scribble-btn--active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return btn;
  };

  const renderToolbar = (): void => {
    toolbar.empty();
    toolbar.toggleClass("vzd-scribble-toolbar--drawing", s.drawing);
    const main = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    const toggle = button(main, s.drawing ? "check" : "pencil", s.drawing ? "scribble.done" : "scribble.draw", () => {
      s.drawing = !s.drawing;
      if (!s.drawing) flush(s);
      refresh();
    }, s.drawing);
    toggle.addClass("vzd-scribble-btn--primary");
    toggle.createEl("span", { cls: "vzd-scribble-btn-text", text: t(s.drawing ? "scribble.done" : "scribble.draw") });
    if (!s.drawing) return;

    const tools = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(tools, "pen-tool", "scribble.pen", () => { s.tool = "pen"; renderToolbar(); }, s.tool === "pen");
    button(tools, "eraser", "scribble.eraser", () => { s.tool = "eraser"; renderToolbar(); }, s.tool === "eraser");

    const colors = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    for (const color of INK_COLORS) {
      const sw = colors.createEl("button", { cls: "vzd-btn vzd-scribble-swatch" });
      sw.style.setProperty("--vzd-scribble-swatch", INK_FILL[color]);
      sw.setAttribute("aria-label", t(COLOR_LABEL[color]));
      const on = s.tool === "pen" && s.color === color;
      sw.toggleClass("vzd-scribble-swatch--active", on);
      sw.setAttribute("aria-pressed", String(on));
      sw.addEventListener("click", (e) => { e.stopPropagation(); s.color = color; s.tool = "pen"; renderToolbar(); });
    }

    const sizes = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    for (const size of PEN_SIZES) {
      const btn = sizes.createEl("button", { cls: "vzd-btn vzd-scribble-size" });
      btn.setAttribute("aria-label", t("scribble.size", { size }));
      const on = s.size === size;
      btn.toggleClass("vzd-scribble-size--active", on);
      btn.setAttribute("aria-pressed", String(on));
      const dot = btn.createEl("span", { cls: "vzd-scribble-dot" });
      dot.style.width = dot.style.height = `${Math.min(16, 3 + size)}px`;
      btn.addEventListener("click", (e) => { e.stopPropagation(); s.size = size; s.tool = "pen"; renderToolbar(); });
    }

    const history = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(history, "undo-2", "scribble.undo", () => stepHistory(s, s.undo, s.redo)).disabled = s.undo.length === 0;
    button(history, "redo-2", "scribble.redo", () => stepHistory(s, s.redo, s.undo)).disabled = s.redo.length === 0;

    const extra = toolbar.createEl("div", { cls: "vzd-scribble-group" });
    button(extra, "hand", "scribble.finger", () => { s.finger = !s.finger; refresh(); }, s.finger);
    button(extra, "chevrons-down", "scribble.taller", () => {
      if (s.height >= SCRIBBLE_MAX_HEIGHT) return;
      pushHistory(s);
      s.height = Math.min(SCRIBBLE_MAX_HEIGHT, s.height + HEIGHT_STEP);
      scheduleSave(s);
      refresh();
    }).disabled = s.height >= SCRIBBLE_MAX_HEIGHT;
    button(extra, "trash-2", "scribble.clear", () => {
      if (s.strokes.length === 0) return;
      pushHistory(s);
      s.strokes = [];
      scheduleSave(s);
      refresh();
    }).disabled = s.strokes.length === 0;
  };

  const refresh = (): void => {
    surface.toggleClass("vzd-scribble-surface--drawing", s.drawing);
    surface.toggleClass("vzd-scribble-surface--finger", s.drawing && s.finger);
    surface.toggleClass("vzd-scribble-surface--eraser", s.drawing && s.tool === "eraser");
    renderStrokes();
    renderToolbar();
  };
  s.refresh = refresh;
  refresh();

  // ── Pointer input ───────────────────────────────────────────────────────
  type Gesture =
    | { kind: "draw"; pointerId: number; points: InkPoint[]; path: SVGPathElement; pen: boolean; frame: number | null }
    | { kind: "erase"; pointerId: number; erased: boolean };
  let gesture: Gesture | null = null;
  let strokeCapShown = false;
  const win = ownerWindow(container);

  const toLocal = (e: PointerEvent, pen: boolean): InkPoint => {
    const rect = svg.getBoundingClientRect();
    const h = s.height;
    const x = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * SCRIBBLE_WIDTH : 0;
    const y = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * h : 0;
    const pressure = pen ? Math.max(MIN_PEN_PRESSURE, e.pressure) : 0.5;
    return quantizePoint(x, y, pressure, h);
  };

  const accepts = (e: PointerEvent): boolean => {
    if (e.pointerType === "pen") return true;
    if (e.pointerType === "touch") return s.finger;
    return e.button === 0;
  };

  const drawLive = (g: Extract<Gesture, { kind: "draw" }>): void => {
    g.frame = null;
    g.path.setAttribute("d", strokePathData(s.size, g.points, false));
  };

  const eraseAt = (g: Extract<Gesture, { kind: "erase" }>, x: number, y: number): void => {
    const hit = s.strokes.filter(st => strokeHit(st, x, y));
    if (hit.length === 0) return;
    if (!g.erased) { pushHistory(s); g.erased = true; }
    const gone = new Set(hit);
    for (const st of hit) {
      paths.get(st)?.remove();
      paths.delete(st);
    }
    s.strokes = s.strokes.filter(st => !gone.has(st));
  };

  const sample = (e: PointerEvent): void => {
    if (!gesture) return;
    if (gesture.kind === "erase") {
      const [x, y] = toLocal(e, false);
      eraseAt(gesture, x, y);
      return;
    }
    if (gesture.points.length >= MAX_POINTS_PER_STROKE) return;
    const p = toLocal(e, gesture.pen);
    const prev = gesture.points[gesture.points.length - 1];
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < MIN_SAMPLE_DISTANCE) return;
    gesture.points.push(p);
  };

  const endGesture = (commit: boolean): void => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    s.busy = false;
    try { surface.releasePointerCapture(g.pointerId); } catch { /* capture already gone */ }
    if (g.kind === "erase") {
      if (g.erased) { scheduleSave(s); refresh(); }
      return;
    }
    if (g.frame !== null) win.cancelAnimationFrame(g.frame);
    g.path.remove();
    if (!commit || g.points.length === 0) return;
    const stroke: InkStroke = { color: s.color, size: s.size, points: g.points };
    pushHistory(s);
    s.strokes = [...s.strokes, stroke];
    addPath(stroke);
    syncFrame();
    renderToolbar();
    scheduleSave(s);
  };

  surface.addEventListener("pointerdown", (e) => {
    if (!s.drawing || gesture || !accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const pen = e.pointerType === "pen";
    // Surface / Wacom pens report the eraser end as button 5 (buttons bit 32).
    const erasing = s.tool === "eraser" || (pen && (e.buttons & 32) !== 0);
    if (!erasing && s.strokes.length >= SCRIBBLE_MAX_STROKES) {
      if (!strokeCapShown) { strokeCapShown = true; new Notice(t("scribble.strokeCap", { max: SCRIBBLE_MAX_STROKES })); }
      return;
    }
    try { surface.setPointerCapture(e.pointerId); } catch { /* not capturable (synthetic event) */ }
    s.busy = true;
    if (erasing) {
      gesture = { kind: "erase", pointerId: e.pointerId, erased: false };
      sample(e);
      return;
    }
    const path = createStrokePath(s.color);
    layer.appendChild(path);
    gesture = { kind: "draw", pointerId: e.pointerId, points: [], path, pen, frame: null };
    sample(e);
    drawLive(gesture);
  });

  surface.addEventListener("pointermove", (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    e.preventDefault();
    const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ev of coalesced.length > 0 ? coalesced : [e]) sample(ev);
    if (gesture.kind === "draw" && gesture.frame === null) {
      const g = gesture;
      g.frame = win.requestAnimationFrame(() => drawLive(g));
    }
  });

  surface.addEventListener("pointerup", (e) => {
    if (gesture && e.pointerId === gesture.pointerId) endGesture(true);
  });
  surface.addEventListener("pointercancel", (e) => {
    if (gesture && e.pointerId === gesture.pointerId) endGesture(false);
  });

  // Keep iOS from scrolling (or starting Scribble handwriting) on a pencil
  // touch; a finger keeps scrolling unless finger drawing is on.
  const blockScroll = (e: TouchEvent): void => {
    if (!s.drawing) return;
    const stylus = Array.from(e.changedTouches).some(tc => (tc as Touch & { touchType?: string }).touchType === "stylus");
    if (stylus || s.finger) e.preventDefault();
  };
  surface.addEventListener("touchstart", blockScroll, { passive: false });
  surface.addEventListener("touchmove", blockScroll, { passive: false });
  // A click in draw mode must not reach the editor and move the cursor into the block.
  surface.addEventListener("click", (e) => { if (s.drawing) e.stopPropagation(); });

  // iOS can suspend the app the moment it is backgrounded; save first.
  const doc = container.ownerDocument;
  const onVisibility = (): void => { if (doc.visibilityState === "hidden") flush(s); };
  doc.addEventListener("visibilitychange", onVisibility);
  onDisconnected(container, () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    if (gesture) endGesture(false);
    releaseCanvas(s, container);
  });
}
