/**
 * Clipped-section hover preview for linked canvas boxes and cards.
 *
 * Unlike Obsidian's native Page Preview (which shows the whole note scrolled to
 * a heading), this renders ONLY the linked chapter — from the heading down to
 * the next heading of the same-or-higher level — in a small popover.
 *
 * Trigger: Cmd/Ctrl + hover on desktop, long-press on mobile (which coexists
 * with the drag gesture: a drag needs deliberate movement, so holding still is
 * free for the preview). The popover is built in the target element's own
 * document so it works in pop-out Obsidian windows.
 */

import { MarkdownRenderer, Component, Platform } from "obsidian";
import type { App, HeadingCache } from "obsidian";
import { ownerWindow } from "../shared/lifecycle";

const SHOW_DELAY_MS = 180;
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;
const CLOSE_GRACE_MS = 140;
const MAX_WIDTH = 400;

/**
 * Extracts the markdown for one heading's section: the heading line through the
 * last line before the next heading of the same or higher level (or EOF).
 * Pure and unit-tested.
 */
export function extractSection(content: string, headings: HeadingCache[], target: string): string | null {
  const key = target.toLowerCase().trim();
  const idx = headings.findIndex(h => h.heading.toLowerCase().trim() === key);
  if (idx === -1) return null;

  const start = headings[idx].position.start.offset;
  const level = headings[idx].level;

  let end = content.length;
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j].level <= level) { end = headings[j].position.start.offset; break; }
  }
  return content.slice(start, end).trim() || null;
}

// ── Single active popover ────────────────────────────────────────────────────

interface ActivePreview {
  el: HTMLElement;
  component: Component;
  dispose: () => void;
}

let active: ActivePreview | null = null;
let token = 0;

// Set while a popover is open so the linked element's mouseenter/leave can keep
// it alive (moving into the popover) or schedule its dismissal.
let activeCancelClose: (() => void) | null = null;
let activeScheduleClose: (() => void) | null = null;

export function closeSectionPreview(): void { close(); }

function close(): void {
  token++; // invalidate any in-flight open
  activeCancelClose = null;
  activeScheduleClose = null;
  if (!active) return;
  active.dispose();
  active.component.unload();
  active.el.remove();
  active = null;
}

async function open(app: App, targetEl: Element, heading: string, sourcePath: string): Promise<void> {
  close();
  const myToken = token;

  const file = app.vault.getFileByPath(sourcePath);
  if (!file) return;

  const headings = app.metadataCache.getFileCache(file)?.headings ?? [];
  let content: string;
  try { content = await app.vault.cachedRead(file); }
  catch { return; }

  if (myToken !== token) return; // cancelled while reading
  const slice = extractSection(content, headings, heading);
  if (!slice) return;

  const doc = targetEl.ownerDocument;
  const win = ownerWindow(targetEl);
  const pop = doc.body.createEl("div", { cls: "popover hover-popover vzd-section-preview" });

  if (Platform.isMobile) {
    const closeBtn = pop.createEl("div", { cls: "vzd-section-preview-close", text: "×" });
    closeBtn.addEventListener("click", close);
  }

  const body = pop.createEl("div", { cls: "vzd-section-preview-content markdown-rendered" });
  const component = new Component();
  component.load();
  await MarkdownRenderer.render(app, slice, body, file.path, component);

  if (myToken !== token) { component.unload(); pop.remove(); return; } // cancelled while rendering

  position(pop, targetEl, win);

  // Dismissal wiring.
  let closeTimer: number | null = null;
  const cancelClose = (): void => { if (closeTimer !== null) { win.clearTimeout(closeTimer); closeTimer = null; } };
  const scheduleClose = (): void => { cancelClose(); closeTimer = win.setTimeout(close, CLOSE_GRACE_MS); };

  // Moving the pointer into the popover keeps it open (native-like); leaving closes it.
  pop.addEventListener("mouseenter", cancelClose);
  pop.addEventListener("mouseleave", scheduleClose);

  const onScroll = (): void => close();
  const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") close(); };
  const onOutside = (e: Event): void => {
    const t = e.target as Node;
    if (!pop.contains(t) && t !== targetEl && !targetEl.contains(t)) close();
  };
  doc.addEventListener("scroll", onScroll, { capture: true });
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("mousedown", onOutside, { capture: true });
  doc.addEventListener("touchstart", onOutside, { capture: true });

  active = {
    el: pop,
    component,
    dispose: () => {
      cancelClose();
      doc.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("mousedown", onOutside, { capture: true } as EventListenerOptions);
      doc.removeEventListener("touchstart", onOutside, { capture: true } as EventListenerOptions);
    },
  };
  activeCancelClose = cancelClose;
  activeScheduleClose = scheduleClose;
}

function position(pop: HTMLElement, targetEl: Element, win: Window): void {
  const r = targetEl.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.maxWidth = `${MAX_WIDTH}px`;

  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;

  let top = r.bottom + 6;
  if (top + ph > win.innerHeight - 8) top = Math.max(8, r.top - ph - 6);

  let left = r.left;
  if (left + pw > win.innerWidth - 8) left = Math.max(8, win.innerWidth - pw - 8);

  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

// ── Attach to a linked element ───────────────────────────────────────────────

/**
 * Wires Cmd/Ctrl-hover (desktop) and long-press (mobile) on `targetEl` to show
 * the clipped-section preview for `heading` in `sourcePath`.
 */
export function attachSectionPreview(app: App, targetEl: Element, heading: string, sourcePath: string): void {
  const win = ownerWindow(targetEl);
  let showTimer: number | null = null;
  const clearShow = (): void => { if (showTimer !== null) { win.clearTimeout(showTimer); showTimer = null; } };

  // Desktop — Cmd/Ctrl + hover.
  let hovering = false;
  targetEl.addEventListener("mouseenter", () => {
    hovering = true;
    activeCancelClose?.();
  });
  targetEl.addEventListener("mousemove", (ev) => {
    const e = ev as MouseEvent;
    if (!hovering || active || showTimer !== null) return;
    if (!(e.metaKey || e.ctrlKey)) return;
    showTimer = win.setTimeout(() => { showTimer = null; void open(app, targetEl, heading, sourcePath); }, SHOW_DELAY_MS);
  });
  targetEl.addEventListener("mouseleave", () => {
    hovering = false;
    clearShow();
    activeScheduleClose?.();
  });

  // Mobile — long-press (hold still). A drag needs deliberate movement, so any
  // movement past the threshold cancels the press before a drag would begin.
  if (Platform.isMobile) {
    let sx = 0, sy = 0;
    let pressTimer: number | null = null;
    const clearPress = (): void => { if (pressTimer !== null) { win.clearTimeout(pressTimer); pressTimer = null; } };

    targetEl.addEventListener("touchstart", (ev) => {
      const t = (ev as TouchEvent).touches[0];
      sx = t.clientX; sy = t.clientY;
      pressTimer = win.setTimeout(() => { pressTimer = null; void open(app, targetEl, heading, sourcePath); }, LONG_PRESS_MS);
    }, { passive: true });
    targetEl.addEventListener("touchmove", (ev) => {
      const t = (ev as TouchEvent).touches[0];
      if (Math.abs(t.clientX - sx) > MOVE_CANCEL_PX || Math.abs(t.clientY - sy) > MOVE_CANCEL_PX) clearPress();
    }, { passive: true });
    targetEl.addEventListener("touchend", clearPress);
    targetEl.addEventListener("touchcancel", clearPress);
  }
}
