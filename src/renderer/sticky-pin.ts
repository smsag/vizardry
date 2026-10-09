/**
 * Sticky canvas pinning (Reading View and Live Preview).
 *
 * A canvas marked `sticky: true` stays visible while you read the rest of the
 * note: once its top scrolls under the view chrome, a read-only clone pins to
 * the top of the reading pane and the document keeps scrolling underneath. The
 * intended use is a reference canvas (e.g. a Business Model Canvas) whose blocks
 * link out to detail sections further down the same note — the full canvas
 * stays in view as you read the detail.
 *
 * Why a clone, and why not CSS `position: sticky`:
 *   - In Reading View every top-level block is wrapped in its own
 *     `.markdown-preview-section`. That section is the sticky element's
 *     containing block, so `position: sticky` would release the moment the
 *     canvas's own block scrolls past — it never floats over the rest of the
 *     note.
 *   - Reading View also virtualizes: a section scrolled far off-screen has its
 *     contents dropped (width/height collapse to 0). A live pinned element
 *     would vanish. So we pin a detached clone and drive its position from JS.
 *
 * Selection is offset-based, not rect-based, precisely so virtualization can't
 * break it: each registered canvas's top offset within the scroll content is
 * captured whenever it is measurable, and "scrolled past the fold" is decided
 * by comparing `scrollTop` to that stored offset. Among all canvases scrolled
 * past, the one lowest in the document (largest offset) wins, so pinning tracks
 * the section you are currently reading — only ever one canvas at a time.
 *
 * On a phone a 50vh strip would bury the note, so the controller runs in
 * compact mode instead: the clone pins as a slim title bar (title, block
 * counter, present + chevron buttons). Tapping the bar opens the canvas below
 * it, browsed one block at a time; tapping outside or scrolling the note on
 * folds it back to the bar.
 *
 * Live Preview (CM6) goes further than Reading View: a widget scrolled about
 * a screen out of view is destroyed, its element removed. A pinned canvas is
 * exactly the one you have scrolled past, so an entry whose element leaves the
 * DOM far from the viewport is kept (the detached element still clones fine,
 * and its offset is cached); one that leaves near the viewport was re-rendered
 * or deleted, and is dropped. When CM6 renders the canvas again, the new
 * element replaces the kept one (same framework + title).
 *
 * One StickyController per note scroller, shared by every sticky canvas
 * under it; it self-disposes when its last canvas unregisters or disconnects.
 */

import { setIcon } from "obsidian";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { t } from "../i18n";
import { carouselSize, carouselSlide, cloneSlideCarousel } from "./grid-carousel";

/** The note's scroll container: the Live Preview editor's, else Reading
 *  View's. The editor's is looked up first so a rendered block nested in it
 *  can't resolve to an inner preview element that doesn't scroll. */
function noteScroller(el: HTMLElement): HTMLElement | null {
  return el.closest<HTMLElement>(".cm-scroller") ?? el.closest<HTMLElement>(".markdown-preview-view");
}

/** An element that leaves the DOM with its box this close to the viewport
 *  (px) was re-rendered or deleted, not virtualized away. CM6 keeps ~1000px
 *  of margin rendered, so virtualization never happens this close. */
const NEAR_VIEWPORT_PX = 200;

interface Geom { left: number; width: number; height: number; }

/** Note scroll (px) after which an opened compact bar folds itself again. */
const BAR_SCROLL_CLOSE_PX = 24;

export interface StickyOptions {
  /** Pin as a tap-to-open title bar (phones) instead of the full canvas. */
  compact?: boolean;
  /** Whether the note this canvas belongs to is still the one shown. Live
   *  Preview reuses its scroller for the next note, so a kept (detached)
   *  entry is dropped once this turns false. */
  isCurrent?: () => boolean;
}

/** Identity that survives a re-render: framework + title. */
function stickyKey(el: HTMLElement): string {
  return `${el.dataset.framework ?? ""}|${el.dataset.canvasTitle ?? ""}`;
}

class StickyController {
  private readonly entries = new Set<HTMLElement>();
  /** Top offset of each entry within the scroll content, captured while the
   *  entry is measurable and reused after it virtualizes away. */
  private readonly offsets = new WeakMap<HTMLElement, number>();
  /** Horizontal box (viewport left + width) of each entry, likewise cached. */
  private readonly geoms = new WeakMap<HTMLElement, Geom>();
  /** Slide each entry's pinned carousel last showed, so unpinning and pinning
   *  again (scrolling back up a little) returns to the same block. */
  private readonly slides = new WeakMap<HTMLElement, number>();
  /** Entries whose element left the DOM by virtualization, kept for pinning. */
  private readonly detached = new Set<HTMLElement>();
  private readonly isCurrent = new WeakMap<HTMLElement, () => boolean>();

  private pinned: HTMLElement | null = null;
  private clone: HTMLElement | null = null;
  private rafPending = false;
  private disposed = false;
  /** Compact bar: scrollTop when it was opened, null while folded. */
  private barOpenedAt: number | null = null;
  /** Releases the compact bar's document listener. */
  private releaseBar: (() => void) | null = null;

  /** Height of the screen's top safe area (status bar, notch), measured once
   *  and again after a resize (rotation). Null until measured. */
  private safeTop: number | null = null;

  private readonly onScrollOrResize = (): void => this.schedule();
  private readonly onResize = (): void => { this.safeTop = null; this.schedule(); };

  constructor(
    private readonly scroller: HTMLElement,
    private readonly win: Window,
    private readonly compact: boolean,
  ) {
    this.scroller.addEventListener("scroll", this.onScrollOrResize, { passive: true });
    this.win.addEventListener("resize", this.onResize);
  }

  add(container: HTMLElement, isCurrent?: () => boolean): void {
    if (this.disposed) return;
    // A re-render of a kept canvas replaces it; a pinned one hands its pin over
    // without flicker (the clone stays).
    for (const old of this.detached) {
      if (old === container || stickyKey(old) !== stickyKey(container)) continue;
      this.detached.delete(old);
      this.entries.delete(old);
      if (this.pinned === old) this.pinned = container;
    }
    this.entries.add(container);
    if (isCurrent) this.isCurrent.set(container, isCurrent);
    this.schedule();
  }

  remove(container: HTMLElement): void {
    this.entries.delete(container);
    this.detached.delete(container);
    if (this.pinned === container) this.unpin();
    if (this.entries.size === 0) { this.dispose(); return; }
    this.schedule();
  }

  /** Drop every entry for the canvas `container` renders (any element). */
  forget(container: HTMLElement): void {
    const key = stickyKey(container);
    for (const el of Array.from(this.entries)) {
      if (el === container || stickyKey(el) === key) this.remove(el);
      if (this.disposed) return;
    }
  }

  /** `container` left the DOM: keep it if it was virtualized away (far from
   *  the viewport), drop it if it was re-rendered or deleted (near it). */
  disconnected(container: HTMLElement): void {
    if (!this.entries.has(container)) return;
    const off = this.offsets.get(container);
    const geom = this.geoms.get(container);
    const top = this.scroller.scrollTop;
    const near = off === undefined || !geom ||
      (off + geom.height > top - NEAR_VIEWPORT_PX && off < top + this.scroller.clientHeight + NEAR_VIEWPORT_PX);
    if (near) this.remove(container);
    else this.detached.add(container);
  }

  private schedule(): void {
    if (this.rafPending || this.disposed) return;
    this.rafPending = true;
    this.win.requestAnimationFrame(() => {
      this.rafPending = false;
      if (!this.disposed) this.update();
    });
  }

  private update(): void {
    const sRect = this.scroller.getBoundingClientRect();

    // Pane hidden (inactive tab, collapsed split): nothing to pin. The clone
    // lives inside `.view-content`, so a `display:none` leaf already hides it —
    // this just keeps our bookkeeping honest.
    if (sRect.height === 0 || this.scroller.offsetParent === null) {
      this.unpin();
      return;
    }

    const scrollTop = this.scroller.scrollTop;

    // A kept canvas belongs to its note: once the scroller shows another one
    // (Live Preview reuses it), let it go.
    for (const el of Array.from(this.detached)) {
      if (this.isCurrent.get(el)?.() === false) {
        this.remove(el);
        if (this.disposed) return;
      }
    }

    // Refresh cached offset/geometry for every currently-measurable entry.
    for (const el of this.entries) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.offsets.set(el, rect.top - sRect.top + scrollTop);
        this.geoms.set(el, { left: rect.left, width: rect.width, height: rect.height });
      }
    }

    // Target = the entry whose top has reached the fold and that sits lowest in
    // the document (largest offset). Entries never yet measured (no offset) are
    // skipped — you cannot pin a canvas you have not scrolled to.
    let target: HTMLElement | null = null;
    let targetOffset = -Infinity;
    for (const el of this.entries) {
      const off = this.offsets.get(el);
      if (off === undefined) continue;
      if (scrollTop >= off - 1 && off > targetOffset) {
        target = el;
        targetOffset = off;
      }
    }

    if (target !== this.pinned) {
      this.unpin();
      if (target) this.pin(target);
    }
    if (this.barOpenedAt !== null && Math.abs(scrollTop - this.barOpenedAt) > BAR_SCROLL_CLOSE_PX) {
      this.setBarOpen(false);
    }
    if (this.pinned) this.position(sRect);
  }

  private pin(target: HTMLElement): void {
    const doc = target.ownerDocument;
    const clone = target.cloneNode(true) as HTMLElement;
    clone.classList.add("vizardry-canvas--pinned");
    clone.classList.remove("vizardry-canvas--minimized");
    clone.setAttribute("aria-hidden", "true");
    // Read-only reference: drop the toolbar and any interaction ids so the
    // clone can't be clicked or double-counted.
    clone.removeAttribute("data-canvas-title");
    clone.querySelectorAll(".vizardry-header-actions").forEach((e) => e.remove());
    clone.querySelectorAll<HTMLElement>("[data-vzd-id]").forEach((e) => e.removeAttribute("data-vzd-id"));
    // Neutralise the full-width inline styles the source carries (relative
    // positioning, translateX(-50%), 100% min-width) — we position it ourselves
    // from the captured viewport box.
    Object.assign(clone.style, {
      position: "fixed",
      transform: "none",
      margin: "0",
      minWidth: "0",
      maxWidth: "none",
      boxSizing: "border-box",
      right: "auto",
    } satisfies Partial<CSSStyleDeclaration>);

    // Mount inside `.view-content` (not <body>) so an inactive/hidden leaf hides
    // the clone with it, and pop-out windows keep their own clone.
    const host = target.closest<HTMLElement>(".view-content") ?? this.scroller.parentElement ?? doc.body;
    host.appendChild(clone);
    this.clone = clone;
    this.pinned = target;

    // A pinned canvas with blocks is browsed one block at a time, like the
    // mobile carousel: the pin strip is capped at half the pane, so a full grid
    // would show only its top row (or, stacked, its first block). The clone is
    // aria-hidden, so its nav stays out of the tab order; keyboard users read
    // the live canvas.
    const carousel = cloneSlideCarousel(target, clone, this.slides.get(target));
    if (this.compact) this.makeBar(target, clone, carousel);
    else if (carousel) {
      clone.querySelectorAll<HTMLElement>(".vizardry-nav-btn").forEach((b) => { b.tabIndex = -1; });
    }
  }

  /** Turn the clone into the compact, tap-to-open title bar. */
  private makeBar(target: HTMLElement, clone: HTMLElement, carousel: boolean): void {
    const header = clone.querySelector<HTMLElement>(":scope > .vizardry-header");
    if (!header) return;
    const doc = clone.ownerDocument;
    clone.classList.add("vizardry-canvas--pinned-bar", "is-collapsed");
    // Interactive, unlike the desktop strip — so not hidden from assistive tech.
    clone.removeAttribute("aria-hidden");

    const count = carousel ? header.createSpan({ cls: "vzd-pin-bar-count" }) : null;
    const syncCount = (): void => {
      if (!count) return;
      count.textContent = `${(carouselSlide(clone) ?? 0) + 1}/${carouselSize(clone) ?? 1}`;
    };
    syncCount();

    // Fullscreen: hand off to the live canvas's present button, which owns the
    // presentation overlay (and still exists while its section is virtualized).
    const present = target.querySelector<HTMLElement>(".vizardry-present-btn");
    if (present) {
      const btn = header.createEl("button", { cls: "vzd-pin-bar-btn" });
      setIcon(btn, "expand");
      btn.setAttribute("aria-label", t("controls.presentFullscreen"));
      btn.addEventListener("click", (e) => { e.stopPropagation(); present.click(); });
    }

    const toggle = header.createEl("button", { cls: "vzd-pin-bar-btn vzd-pin-bar-toggle" });
    header.addEventListener("click", () => this.setBarOpen(this.barOpenedAt === null));
    // The carousel's own handlers run first (registered earlier), so the
    // counter reads the slide they just moved to.
    clone.addEventListener("click", syncCount);
    clone.addEventListener("touchend", syncCount, { passive: true });

    const onOutside = (e: Event): void => {
      if (!clone.contains(e.target as Node)) this.setBarOpen(false);
    };
    doc.addEventListener("pointerdown", onOutside, true);
    this.releaseBar = () => doc.removeEventListener("pointerdown", onOutside, true);
    this.barOpenedAt = null;
    this.syncBar(toggle);
  }

  private setBarOpen(open: boolean): void {
    if (!this.clone?.classList.contains("vizardry-canvas--pinned-bar")) return;
    this.barOpenedAt = open ? this.scroller.scrollTop : null;
    this.clone.classList.toggle("is-collapsed", !open);
    const toggle = this.clone.querySelector<HTMLElement>(".vzd-pin-bar-toggle");
    if (toggle) this.syncBar(toggle);
  }

  private syncBar(toggle: HTMLElement): void {
    const open = this.barOpenedAt !== null;
    setIcon(toggle, open ? "chevron-up" : "chevron-down");
    toggle.setAttribute("aria-label", t(open ? "controls.minimize" : "controls.expand"));
    toggle.setAttribute("aria-expanded", String(open));
  }

  /** The viewport y below which the note is visible and reachable. On a
   *  phone the note scrolls under the status bar once Obsidian hides its
   *  header, so the scroller's own top is the top of the screen: a bar pinned
   *  there sits behind the clock and the Dynamic Island, where iOS keeps taps
   *  for itself. Pin below the top safe area, and below the view header while
   *  it shows over the note. */
  private visibleTop(sRect: DOMRect): number {
    let top = sRect.top;
    if (this.safeTop === null) this.safeTop = measureSafeTop(this.scroller.ownerDocument);
    top = Math.max(top, this.safeTop);
    const header = this.scroller.closest(".workspace-leaf-content")?.querySelector<HTMLElement>(":scope > .view-header");
    if (header) {
      const h = header.getBoundingClientRect();
      // Only a header that is shown and overlaps the scroller's top edge.
      if (h.height > 0 && h.bottom > top && h.top <= top) top = h.bottom;
    }
    return top;
  }

  /** The clone spans the note pane edge to edge right under its header —
   *  an extension of the header, not a box floating over the text — and pads
   *  its content in to the canvas's own column, so the canvas sits exactly
   *  where it was. */
  private position(sRect: DOMRect): void {
    const geom = this.pinned && this.geoms.get(this.pinned);
    if (!geom || !this.clone) return;
    const chromeTop = this.visibleTop(sRect);
    const left = sRect.left;
    const width = this.scroller.clientWidth || sRect.width; // without the scrollbar
    const s = this.clone.style;
    s.top = `${chromeTop}px`;
    s.left = `${left}px`;
    s.width = `${width}px`;
    s.paddingLeft = `${Math.max(0, geom.left - left)}px`;
    s.paddingRight = `${Math.max(0, left + width - (geom.left + geom.width))}px`;
    // `position: fixed` resolves against the nearest ancestor with `contain`,
    // `transform` or `filter`, not the viewport — and Obsidian's workspace
    // leaves set `contain`. top/left above are viewport coordinates, so the
    // clone landed shifted by the leaf's own offset (the sidebar width): half
    // off the pane, unreadable. Measure the drift and subtract it. Skipped
    // without a layout box (hidden pane, no layout engine in tests).
    const r = this.clone.getBoundingClientRect();
    if (r.width === 0) return;
    const dx = r.left - left;
    const dy = r.top - chromeTop;
    if (Math.abs(dx) > 0.5) s.left = `${left - dx}px`;
    if (Math.abs(dy) > 0.5) s.top = `${chromeTop - dy}px`;
  }

  private unpin(): void {
    if (this.pinned && this.clone) {
      const slide = carouselSlide(this.clone);
      if (slide !== undefined) this.slides.set(this.pinned, slide);
    }
    this.releaseBar?.();
    this.releaseBar = null;
    this.barOpenedAt = null;
    this.clone?.remove();
    this.clone = null;
    this.pinned = null;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unpin();
    this.scroller.removeEventListener("scroll", this.onScrollOrResize);
    this.win.removeEventListener("resize", this.onResize);
    controllers.delete(this.scroller);
  }
}

/** `env(safe-area-inset-top)` in px: 0 on desktop and on phones without a
 *  notch or status-bar overlay. CSS env() can't be read from script, so a
 *  hidden probe takes it as padding. */
function measureSafeTop(doc: Document): number {
  const probe = doc.body.createDiv({ cls: "vzd-safe-area-probe" });
  probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px)";
  const px = parseFloat(doc.defaultView?.getComputedStyle(probe).paddingTop ?? "0") || 0;
  probe.remove();
  return px;
}

const controllers = new WeakMap<HTMLElement, StickyController>();

/**
 * Start pinning `container` when it scrolls under the note's chrome (Reading
 * View or Live Preview). No-op outside a note scroller. Safe to call more than
 * once for the same container — registration is idempotent.
 */
export function activateSticky(container: HTMLElement, options: StickyOptions = {}): void {
  const scroller = noteScroller(container);
  if (!scroller) return;
  let ctrl = controllers.get(scroller);
  if (!ctrl) {
    ctrl = new StickyController(scroller, ownerWindow(scroller), options.compact ?? false);
    controllers.set(scroller, ctrl);
  }
  ctrl.add(container, options.isCurrent);
  // When the block leaves the DOM the controller decides: re-rendered or
  // deleted → dropped (so a stale entry can't keep the controller alive);
  // virtualized away → kept. Registered once per container: every pin toggle
  // used to add another registration.
  if (!watched.has(container)) {
    watched.add(container);
    onDisconnected(container, () => { watched.delete(container); controllers.get(scroller)?.disconnected(container); });
  }
}

/** Containers whose disconnect watch is already registered. */
const watched = new WeakSet<HTMLElement>();

/** Stop pinning the canvas `container` renders — including a copy of it kept
 *  from before a re-render — and remove its clone if currently pinned. */
export function deactivateSticky(container: HTMLElement): void {
  const scroller = noteScroller(container);
  if (!scroller) return;
  controllers.get(scroller)?.forget(container);
}
