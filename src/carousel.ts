import type { CarouselBlock, CarouselImage, CarouselResult } from "./types";
import { SWIPE_THRESHOLD_PX } from "./shared/constants";

// ── Parser ────────────────────────────────────────────────────────────────────
// Accepts standard Markdown image syntax, one image per line.
// Blank lines and lines starting with # are ignored.
// Any line that is not a Markdown image returns a parse error.
//
// Syntax:
//   ![Alt text](path/to/image.png)
//   ![](path/to/other.png)

export function parseCarouselBlock(source: string): CarouselResult {
  const lines = source.split("\n");
  const images: CarouselImage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (!match) {
      return {
        ok: false,
        error: `Line ${i + 1}: expected Markdown image syntax "![alt](path)" — got "${trimmed}"`,
      };
    }
    const alt = match[1].trim();
    const src = match[2].trim();
    if (!src) {
      return { ok: false, error: `Line ${i + 1}: image path cannot be empty` };
    }
    images.push({ src, alt });
  }

  if (images.length < 2) {
    return { ok: false, error: "A carousel requires at least 2 images" };
  }

  return { ok: true, data: { images } };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

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
      "aria-label": `Image carousel, ${images.length} images`,
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
    attr: { type: "button", "aria-label": "Previous image" },
  });

  const dotsWrap = controls.createEl("div", { cls: "vzd-carousel-dots" });

  const dots = images.map((_, idx) => {
    const dot = dotsWrap.createEl("button", {
      cls: "vzd-carousel-dot",
      attr: { type: "button", "aria-label": `Go to image ${idx + 1}` },
    });
    dot.toggleClass("vzd-carousel-dot-active", idx === 0);
    return dot;
  });

  const nextBtn = controls.createEl("button", {
    cls: "vzd-carousel-btn",
    text: "›",
    attr: { type: "button", "aria-label": "Next image" },
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
