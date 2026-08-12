import { setIcon } from "obsidian";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected } from "../shared/lifecycle";
import { t } from "../i18n";

/**
 * Renders several canvases from a single ```vizardry fence as an always-on
 * carousel: one panel visible at a time with prev/next buttons, dot
 * indicators, touch swipe, and left/right arrow keys.
 *
 * Unlike `setupSlideCarousel` (which only collapses an already-rendered grid
 * into slides below the 600px mobile breakpoint), this owns the panels and
 * shows exactly one on every viewport, because the panels are independent
 * canvases rather than cells of one layout.
 *
 * `renderPanel` fills each panel element with a fully-rendered canvas; the
 * caller renders read-only (see `renderReadOnly`), since the panels share one
 * code fence and per-canvas write-back can't target the right source lines.
 */
export function renderMultiCanvas(
  segments: string[],
  el: HTMLElement,
  renderPanel: (segment: string, panelEl: HTMLElement) => void,
): void {
  const root = el.createEl("div", { cls: "vzd-multi" });
  const track = root.createEl("div", { cls: "vzd-multi-track" });

  const panels = segments.map((segment) => {
    const panel = track.createEl("div", { cls: "vzd-multi-panel" });
    renderPanel(segment, panel);
    return panel;
  });

  const count = panels.length;
  let current = 0;

  const nav = root.createEl("div", { cls: "vizardry-nav vzd-multi-nav" });
  const prev = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(prev, "chevron-left");
  prev.setAttribute("aria-label", t("nav.previousBlock"));

  const dotsWrap = nav.createEl("div", { cls: "vizardry-nav-dots" });
  const dots = panels.map((_, i) => {
    const dot = dotsWrap.createEl("span", { cls: "vizardry-nav-dot" });
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", `${i + 1}`);
    dot.addEventListener("click", () => show(i));
    return dot;
  });

  const next = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(next, "chevron-right");
  next.setAttribute("aria-label", t("nav.nextBlock"));

  function show(i: number): void {
    current = Math.max(0, Math.min(count - 1, i));
    panels.forEach((p, k) => p.classList.toggle("is-active", k === current));
    dots.forEach((d, k) => d.classList.toggle("is-active", k === current));
    prev.disabled = current === 0;
    next.disabled = current === count - 1;
  }

  prev.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));

  // Arrow-key navigation when the carousel (or something inside it) is focused.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "ArrowLeft") { show(current - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { show(current + 1); e.preventDefault(); }
  };
  root.setAttribute("tabindex", "0");
  root.addEventListener("keydown", onKey);

  // Touch swipe.
  let touchStartX = 0;
  const onTouchStart = (e: TouchEvent): void => { touchStartX = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent): void => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      if (delta > 0) show(current + 1);
      else show(current - 1);
    }
  };
  track.addEventListener("touchstart", onTouchStart, { passive: true });
  track.addEventListener("touchend", onTouchEnd, { passive: true });

  onDisconnected(root, () => {
    root.removeEventListener("keydown", onKey);
    track.removeEventListener("touchstart", onTouchStart);
    track.removeEventListener("touchend", onTouchEnd);
  });

  show(0);
}
