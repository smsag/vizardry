import type { CarouselBlock } from "../types";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { t } from "../i18n";

export function renderCarouselBlock(
  data: CarouselBlock,
  el: HTMLElement,
  resolvePath: (src: string) => string
): void {
  const { images } = data;

  const wrapper = el.createEl("div", {
    cls: "vzd-carousel",
    attr: {
      tabindex: "0",
      role: "region",
      "aria-label": t("nav.imageCarousel", { n: images.length }),
    },
  });

  const header = wrapper.createEl("div", { cls: "vzd-carousel-header" });

  const descEl = header.createEl("span", {
    cls: "vzd-carousel-desc",
    text: images[0].alt,
  });

  const controls = header.createEl("div", { cls: "vzd-carousel-controls" });

  const prevBtn = controls.createEl("button", {
    cls: "vzd-carousel-btn",
    text: "‹",
    attr: { type: "button", "aria-label": t("nav.previousImage") },
  });

  const nextBtn = controls.createEl("button", {
    cls: "vzd-carousel-btn",
    text: "›",
    attr: { type: "button", "aria-label": t("nav.nextImage") },
  });

  const track = wrapper.createEl("div", { cls: "vzd-carousel-track" });

  const resolvedSrcs = images.map(img => resolvePath(img.src));

  const slideEls = images.map((img, idx) => {
    const slide = track.createEl("div", { cls: "vzd-carousel-slide" });
    slide.toggleClass("vzd-carousel-slide-active", idx === 0);

    const image = slide.createEl("img");
    image.alt = img.alt;
    image.draggable = false;

    return { slide, image };
  });

  // Preload off-DOM to collect natural dimensions from all images before
  // setting any src on the visible slides. This lets us lock the track's
  // aspect-ratio once — preventing text below from jumping as images arrive.
  let probesSettled = 0;
  let maxRatio = 0;
  let bestW = 1, bestH = 1;

  resolvedSrcs.forEach((src, idx) => {
    const probe = new Image();
    const settle = (): void => {
      if (probe.naturalWidth > 0) {
        const ratio = probe.naturalHeight / probe.naturalWidth;
        if (ratio > maxRatio) {
          maxRatio = ratio;
          bestW = probe.naturalWidth;
          bestH = probe.naturalHeight;
        }
      }
      slideEls[idx].image.src = src;
      probesSettled++;
      if (probesSettled === images.length && maxRatio > 0) {
        track.style.aspectRatio = `${bestW} / ${bestH}`;
      }
    };
    probe.addEventListener("load", settle);
    probe.addEventListener("error", settle);
    probe.src = src;
  });

  const slides = slideEls.map(s => s.slide);

  let current = 0;

  function goTo(next: number): void {
    slides[current].removeClass("vzd-carousel-slide-active");
    current = ((next % images.length) + images.length) % images.length;
    slides[current].addClass("vzd-carousel-slide-active");
    descEl.textContent = images[current].alt;
  }

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
  wrapper.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goTo(current + 1); }
  });

  let touchStartX = 0;
  wrapper.addEventListener("touchstart", (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  wrapper.addEventListener("touchend", (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) goTo(dx < 0 ? current + 1 : current - 1);
  }, { passive: true });
}
