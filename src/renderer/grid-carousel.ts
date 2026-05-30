import { setIcon } from "obsidian";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected } from "../shared/lifecycle";
import { t } from "../i18n";

export function setupMobileCarousel(container: HTMLElement, blockCount: number): void {
  let current = 0;
  const mq = window.matchMedia("(max-width: 600px)");

  const nav = container.createEl("div", { cls: "vizardry-nav" });
  const prev = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(prev, "chevron-left");
  prev.setAttribute("aria-label", t("nav.previousBlock"));

  const dotsWrap = nav.createEl("div", { cls: "vizardry-nav-dots" });
  const dots = Array.from({ length: blockCount }, () =>
    dotsWrap.createEl("span", { cls: "vizardry-nav-dot" })
  );

  const next = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(next, "chevron-right");
  next.setAttribute("aria-label", t("nav.nextBlock"));

  function applyMobile(): void {
    container.querySelectorAll<HTMLElement>(".vizardry-block").forEach((b, i) =>
      b.classList.toggle("vizardry-block-active", i === current)
    );
    dots.forEach((d, i) => d.classList.toggle("is-active", i === current));
    prev.disabled = current === 0;
    next.disabled = current === blockCount - 1;
  }

  function resetLayout(): void {
    container.querySelectorAll<HTMLElement>(".vizardry-block").forEach(b => {
      b.classList.remove("vizardry-block-active");
    });
    dots.forEach(d => d.classList.remove("is-active"));
    prev.disabled = false;
    next.disabled = false;
  }

  const onMediaChange = (e: MediaQueryList | MediaQueryListEvent): void => {
    if (e.matches) {
      nav.style.display = "flex";
      applyMobile();
    } else {
      nav.style.display = "none";
      resetLayout();
    }
  };

  nav.style.display = "none";
  mq.addEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
  onMediaChange(mq);

  prev.addEventListener("click", () => { if (current > 0) { current--; applyMobile(); } });
  next.addEventListener("click", () => { if (current < blockCount - 1) { current++; applyMobile(); } });

  let touchStartX = 0;
  const onTouchStart = (e: TouchEvent): void => { touchStartX = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent): void => {
    if (!mq.matches) return;
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      if (delta > 0 && current < blockCount - 1) { current++; applyMobile(); }
      else if (delta < 0 && current > 0) { current--; applyMobile(); }
    }
  };
  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchend", onTouchEnd, { passive: true });

  onDisconnected(container, () => {
    mq.removeEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchend", onTouchEnd);
  });
}
