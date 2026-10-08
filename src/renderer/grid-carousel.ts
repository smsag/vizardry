import { setIcon } from "obsidian";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { t } from "../i18n";

/** Set on the container while it shows one slide at a time. The carousel
 *  layout rules in styles.css key off this class rather than a media query, so
 *  a forced carousel (the pinned clone) gets them at any viewport width. */
const CAROUSEL_CLASS = "vzd-carousel";

interface CarouselSpec {
  slideSelector: string;
  activeClass: string;
  slideCount: number;
  current: () => number;
}

/** Each carousel's setup, so a clone of its container can rebuild it. */
const carousels = new WeakMap<HTMLElement, CarouselSpec>();

export interface CarouselOptions {
  /** Always show one slide at a time, whatever the viewport width. */
  forced?: boolean;
  /** Slide to open on (clamped to the slide range). */
  start?: number;
}

/**
 * Adds a mobile (<=600px) swipeable one-slide-at-a-time carousel on top of a
 * grid canvas's existing DOM. Below the breakpoint the grid renders normally
 * and the nav stays hidden; at/under it, prev/next buttons + dots + touch
 * swipe toggle `activeClass` on whichever of `container`'s descendants match
 * `slideSelector` so only one is visible at a time. With `forced`, the
 * carousel is on at every width.
 */
export function setupSlideCarousel(
  container: HTMLElement,
  slideSelector: string,
  activeClass: string,
  slideCount: number,
  options: CarouselOptions = {},
): void {
  let current = Math.min(Math.max(options.start ?? 0, 0), Math.max(slideCount - 1, 0));
  let active = false;
  const mq = options.forced ? null : ownerWindow(container).matchMedia("(max-width: 600px)");

  const nav = container.createEl("div", { cls: "vizardry-nav" });
  const prev = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(prev, "chevron-left");
  prev.setAttribute("aria-label", t("nav.previousBlock"));

  const dotsWrap = nav.createEl("div", { cls: "vizardry-nav-dots" });
  const dots = Array.from({ length: slideCount }, () =>
    dotsWrap.createEl("span", { cls: "vizardry-nav-dot" })
  );

  const next = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(next, "chevron-right");
  next.setAttribute("aria-label", t("nav.nextBlock"));

  function applyMobile(): void {
    container.querySelectorAll<HTMLElement>(slideSelector).forEach((el, i) =>
      el.classList.toggle(activeClass, i === current)
    );
    dots.forEach((d, i) => d.classList.toggle("is-active", i === current));
    prev.disabled = current === 0;
    next.disabled = current === slideCount - 1;
  }

  function resetLayout(): void {
    container.querySelectorAll<HTMLElement>(slideSelector).forEach(el =>
      el.classList.remove(activeClass)
    );
    dots.forEach(d => d.classList.remove("is-active"));
    prev.disabled = false;
    next.disabled = false;
  }

  function setActive(on: boolean): void {
    active = on;
    container.classList.toggle(CAROUSEL_CLASS, on);
    nav.style.display = on ? "flex" : "none";
    if (on) applyMobile(); else resetLayout();
  }

  const onMediaChange = (e: MediaQueryList | MediaQueryListEvent): void => setActive(e.matches);

  if (mq) {
    mq.addEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
    onMediaChange(mq);
  } else {
    setActive(true);
  }

  prev.addEventListener("click", () => { if (current > 0) { current--; applyMobile(); } });
  next.addEventListener("click", () => { if (current < slideCount - 1) { current++; applyMobile(); } });

  let touchStartX = 0;
  const onTouchStart = (e: TouchEvent): void => { touchStartX = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent): void => {
    if (!active) return;
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      if (delta > 0 && current < slideCount - 1) { current++; applyMobile(); }
      else if (delta < 0 && current > 0) { current--; applyMobile(); }
    }
  };
  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchend", onTouchEnd, { passive: true });

  carousels.set(container, { slideSelector, activeClass, slideCount, current: () => current });

  // A forced carousel holds no window listener, and its own listeners go with
  // the element when it is removed, so there is nothing to release.
  if (mq) {
    onDisconnected(container, () => {
      mq.removeEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
    });
  }
}

/** The slide `container`'s carousel currently shows, or undefined without one. */
export function carouselSlide(container: HTMLElement): number | undefined {
  return carousels.get(container)?.current();
}

/** How many slides `container`'s carousel has, or undefined without one. */
export function carouselSize(container: HTMLElement): number | undefined {
  return carousels.get(container)?.slideCount;
}

/**
 * Rebuild `source`'s carousel on `clone` (a `cloneNode` copy, which carries the
 * DOM but none of the listeners), forced on and opening on `start` (default:
 * the slide `source` currently shows). Returns false when `source` has no
 * carousel.
 */
export function cloneSlideCarousel(source: HTMLElement, clone: HTMLElement, start?: number): boolean {
  const spec = carousels.get(source);
  if (!spec) return false;
  // The copied nav has no listeners; replace it with a live one.
  for (const el of Array.from(clone.children)) {
    if (el.classList.contains("vizardry-nav")) el.remove();
  }
  setupSlideCarousel(clone, spec.slideSelector, spec.activeClass, spec.slideCount, {
    forced: true,
    start: start ?? spec.current(),
  });
  return true;
}
