/**
 * Sticky canvas pinning (Reading View, desktop only).
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
 * One StickyController per reading-view scroller, shared by every sticky canvas
 * under it; it self-disposes when its last canvas unregisters or disconnects.
 */

import { onDisconnected, ownerWindow } from "../shared/lifecycle";

/** The Reading View scroll container. Live Preview (`.cm-editor`) is not
 *  supported — CM6 virtualizes lines even more aggressively. */
const READING_SCROLLER = ".markdown-preview-view";

interface Geom { left: number; width: number; }

class StickyController {
  private readonly entries = new Set<HTMLElement>();
  /** Top offset of each entry within the scroll content, captured while the
   *  entry is measurable and reused after it virtualizes away. */
  private readonly offsets = new WeakMap<HTMLElement, number>();
  /** Horizontal box (viewport left + width) of each entry, likewise cached. */
  private readonly geoms = new WeakMap<HTMLElement, Geom>();

  private pinned: HTMLElement | null = null;
  private clone: HTMLElement | null = null;
  private rafPending = false;
  private disposed = false;

  private readonly onScrollOrResize = (): void => this.schedule();

  constructor(private readonly scroller: HTMLElement, private readonly win: Window) {
    this.scroller.addEventListener("scroll", this.onScrollOrResize, { passive: true });
    this.win.addEventListener("resize", this.onScrollOrResize);
  }

  add(container: HTMLElement): void {
    if (this.disposed) return;
    this.entries.add(container);
    this.schedule();
  }

  remove(container: HTMLElement): void {
    this.entries.delete(container);
    if (this.pinned === container) this.unpin();
    if (this.entries.size === 0) { this.dispose(); return; }
    this.schedule();
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

    // Refresh cached offset/geometry for every currently-measurable entry.
    for (const el of this.entries) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.offsets.set(el, rect.top - sRect.top + scrollTop);
        this.geoms.set(el, { left: rect.left, width: rect.width });
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
    if (this.pinned) this.position(sRect.top);
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
      right: "auto",
    } satisfies Partial<CSSStyleDeclaration>);

    // Mount inside `.view-content` (not <body>) so an inactive/hidden leaf hides
    // the clone with it, and pop-out windows keep their own clone.
    const host = target.closest<HTMLElement>(".view-content") ?? this.scroller.parentElement ?? doc.body;
    host.appendChild(clone);
    this.clone = clone;
    this.pinned = target;
  }

  private position(chromeTop: number): void {
    const geom = this.pinned && this.geoms.get(this.pinned);
    if (!geom || !this.clone) return;
    this.clone.style.top = `${chromeTop}px`;
    this.clone.style.left = `${geom.left}px`;
    this.clone.style.width = `${geom.width}px`;
  }

  private unpin(): void {
    this.clone?.remove();
    this.clone = null;
    this.pinned = null;
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unpin();
    this.scroller.removeEventListener("scroll", this.onScrollOrResize);
    this.win.removeEventListener("resize", this.onScrollOrResize);
    controllers.delete(this.scroller);
  }
}

const controllers = new WeakMap<HTMLElement, StickyController>();

/**
 * Start pinning `container` when it scrolls under the reading-view chrome.
 * No-op outside Reading View (no `.markdown-preview-view` ancestor). Safe to
 * call more than once for the same container — registration is idempotent.
 */
export function activateSticky(container: HTMLElement): void {
  const scroller = container.closest<HTMLElement>(READING_SCROLLER);
  if (!scroller) return;
  let ctrl = controllers.get(scroller);
  if (!ctrl) {
    ctrl = new StickyController(scroller, ownerWindow(scroller));
    controllers.set(scroller, ctrl);
  }
  ctrl.add(container);
  // Also drop it when the block is re-rendered/removed, so a stale entry can't
  // keep a controller (and its listeners) alive.
  onDisconnected(container, () => controllers.get(scroller)?.remove(container));
}

/** Stop pinning `container` and remove its clone if currently pinned. */
export function deactivateSticky(container: HTMLElement): void {
  const scroller = container.closest<HTMLElement>(READING_SCROLLER);
  if (!scroller) return;
  controllers.get(scroller)?.remove(container);
}
