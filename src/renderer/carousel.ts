import { setIcon } from "obsidian";
import type { CarouselBlock } from "../types";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { t } from "../i18n";
import { onDisconnected } from "../shared/lifecycle";

export function renderCarouselBlock(
  data: CarouselBlock,
  el: HTMLElement,
  resolvePath: (src: string) => string
): void {
  const { images } = data;

  const wrapper = el.createEl("div", {
    cls: "vzd-carousel vizardry-canvas",
    attr: {
      tabindex: "0",
      role: "region",
      "aria-label": t("nav.imageCarousel", { n: images.length }),
      "data-framework": "carousel",
    },
  });

  const header = wrapper.createEl("div", { cls: "vizardry-header" });

  const descEl = header.createEl("span", {
    cls: "vizardry-title vzd-carousel-desc",
    text: images[0].alt,
  });

  const actions = header.createEl("div", { cls: "vizardry-header-actions" });

  const fullscreenBtn = actions.createEl("button", {
    cls: "vzd-btn",
    attr: { "aria-label": t("controls.presentFullscreen") },
  }) as HTMLButtonElement;
  setIcon(fullscreenBtn, "expand");

  const prevBtn = actions.createEl("button", {
    cls: "vzd-btn",
    attr: { "aria-label": t("nav.previousImage"), "data-action": "prev" },
  }) as HTMLButtonElement;
  setIcon(prevBtn, "chevron-left");

  const nextBtn = actions.createEl("button", {
    cls: "vzd-btn",
    attr: { "aria-label": t("nav.nextImage"), "data-action": "next" },
  }) as HTMLButtonElement;
  setIcon(nextBtn, "chevron-right");

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

  // ── Fullscreen overlay ───────────────────────────────────────────────────
  function openFullscreen(): void {
    let fsCurrent = current;

    const overlay = document.body.createEl("div", { cls: "vzd-carousel-fs" });

    const fsImg = overlay.createEl("img", { cls: "vzd-carousel-fs-img" });
    fsImg.draggable = false;

    const fsCaption = overlay.createEl("div", { cls: "vzd-carousel-fs-caption" });
    const fsCounter = overlay.createEl("div", { cls: "vzd-carousel-fs-counter" });

    const fsPrev = overlay.createEl("span", {
      cls: "vzd-carousel-fs-btn vzd-carousel-fs-btn--prev",
      text: "‹",
      attr: { role: "button", "aria-label": t("nav.previousImage") },
    });
    const fsNext = overlay.createEl("span", {
      cls: "vzd-carousel-fs-btn vzd-carousel-fs-btn--next",
      text: "›",
      attr: { role: "button", "aria-label": t("nav.nextImage") },
    });
    const fsClose = overlay.createEl("span", {
      cls: "vzd-carousel-fs-close",
      text: "×",
      attr: { role: "button", "aria-label": t("controls.exitPresentation") },
    });

    const fsGoTo = (next: number): void => {
      fsCurrent = ((next % images.length) + images.length) % images.length;
      fsImg.src = resolvedSrcs[fsCurrent];
      fsImg.alt = images[fsCurrent].alt;
      fsCaption.textContent = images[fsCurrent].alt;
      fsCounter.textContent = `${fsCurrent + 1} / ${images.length}`;
      fsPrev.style.display = images.length < 2 ? "none" : "";
      fsNext.style.display = images.length < 2 ? "none" : "";
    };

    const dismiss = (): void => {
      overlay.remove();
      document.removeEventListener("keydown", onFsKey);
    };

    const onFsKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape")      dismiss();
      if (e.key === "ArrowLeft")   fsGoTo(fsCurrent - 1);
      if (e.key === "ArrowRight")  fsGoTo(fsCurrent + 1);
    };

    fsGoTo(fsCurrent);
    fsPrev.addEventListener("click", () => fsGoTo(fsCurrent - 1));
    fsNext.addEventListener("click", () => fsGoTo(fsCurrent + 1));
    fsClose.addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
    document.addEventListener("keydown", onFsKey);

    let fsTouchX = 0;
    overlay.addEventListener("touchstart", (e) => { fsTouchX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - fsTouchX;
      if (Math.abs(dx) > SWIPE_THRESHOLD_PX) fsGoTo(dx < 0 ? fsCurrent + 1 : fsCurrent - 1);
    }, { passive: true });

    onDisconnected(wrapper, dismiss);
  }

  // Native <button> elements handle Enter/Space keyboard activation automatically
  fullscreenBtn.addEventListener("click", openFullscreen);
  // Double-click the image track also opens fullscreen
  track.addEventListener("dblclick", openFullscreen);

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
