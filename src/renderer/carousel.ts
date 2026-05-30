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

  const track = wrapper.createEl("div", { cls: "vzd-carousel-track" });

  const slides = images.map((img, idx) => {
    const slide = track.createEl("div", { cls: "vzd-carousel-slide" });
    slide.toggleClass("vzd-carousel-slide-active", idx === 0);

    const image = slide.createEl("img");
    image.src = resolvePath(img.src);
    image.alt = img.alt;
    image.draggable = false;

    image.addEventListener("load", () => {
      const current = parseInt(track.style.minHeight || "0", 10);
      if (image.naturalHeight > current) {
        track.style.minHeight = `${image.naturalHeight}px`;
      }
    });

    return slide;
  });

  const controls = wrapper.createEl("div", { cls: "vzd-carousel-controls" });

  const prevBtn = controls.createEl("button", {
    cls: "vzd-carousel-btn",
    text: "‹",
    attr: { type: "button", "aria-label": t("nav.previousImage") },
  });

  const dotsWrap = controls.createEl("div", { cls: "vzd-carousel-dots" });

  const dots = images.map((_, idx) => {
    const dot = dotsWrap.createEl("button", {
      cls: "vzd-carousel-dot",
      attr: { type: "button", "aria-label": t("nav.goToImage", { n: idx + 1 }) },
    });
    dot.toggleClass("vzd-carousel-dot-active", idx === 0);
    return dot;
  });

  const nextBtn = controls.createEl("button", {
    cls: "vzd-carousel-btn",
    text: "›",
    attr: { type: "button", "aria-label": t("nav.nextImage") },
  });

  let current = 0;

  function goTo(next: number): void {
    slides[current].removeClass("vzd-carousel-slide-active");
    dots[current].removeClass("vzd-carousel-dot-active");
    current = ((next % images.length) + images.length) % images.length;
    slides[current].addClass("vzd-carousel-slide-active");
    dots[current].addClass("vzd-carousel-dot-active");
  }

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
  dots.forEach((dot, idx) => dot.addEventListener("click", () => goTo(idx)));

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
