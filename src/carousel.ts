import { CarouselBlock, CarouselImage, CarouselResult } from "./types";

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
// Pure DOM build — no MutationObserver, no post-processor, no async src
// resolution. Obsidian resolves vault paths before calling the code block
// processor, so image src values are correct at render time.

export function renderCarouselBlock(
  data: CarouselBlock,
  el: HTMLElement,
  resolvePath: (src: string) => string
): void {
  const { images } = data;

  const wrapper = document.createElement("div");
  wrapper.className = "vzd-carousel";
  wrapper.setAttribute("tabindex", "0");
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", `Image carousel, ${images.length} images`);

  const track = document.createElement("div");
  track.className = "vzd-carousel-track";

  const slides = images.map((img, idx) => {
    const slide = document.createElement("div");
    slide.className = idx === 0 ? "vzd-carousel-slide vzd-carousel-slide-active" : "vzd-carousel-slide";

    const image = document.createElement("img");
    image.src = resolvePath(img.src);
    image.alt = img.alt;
    image.draggable = false;

    image.addEventListener("load", () => {
      const current = parseInt(track.style.minHeight || "0", 10);
      if (image.naturalHeight > current) {
        track.style.minHeight = `${image.naturalHeight}px`;
      }
    });

    slide.appendChild(image);
    track.appendChild(slide);
    return slide;
  });
  wrapper.appendChild(track);

  const controls = document.createElement("div");
  controls.className = "vzd-carousel-controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "vzd-carousel-btn";
  prevBtn.type = "button";
  prevBtn.setAttribute("aria-label", "Previous image");
  prevBtn.textContent = "‹";

  const dotsWrap = document.createElement("div");
  dotsWrap.className = "vzd-carousel-dots";

  const dots = images.map((_, idx) => {
    const dot = document.createElement("button");
    dot.className = idx === 0 ? "vzd-carousel-dot vzd-carousel-dot-active" : "vzd-carousel-dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `Go to image ${idx + 1}`);
    dotsWrap.appendChild(dot);
    return dot;
  });

  const nextBtn = document.createElement("button");
  nextBtn.className = "vzd-carousel-btn";
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "Next image");
  nextBtn.textContent = "›";

  controls.appendChild(prevBtn);
  controls.appendChild(dotsWrap);
  controls.appendChild(nextBtn);
  wrapper.appendChild(controls);

  let current = 0;

  function goTo(next: number): void {
    slides[current].classList.remove("vzd-carousel-slide-active");
    dots[current].classList.remove("vzd-carousel-dot-active");
    current = ((next % images.length) + images.length) % images.length;
    slides[current].classList.add("vzd-carousel-slide-active");
    dots[current].classList.add("vzd-carousel-dot-active");
  }

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
  dots.forEach((dot, idx) => dot.addEventListener("click", () => goTo(idx)));

  wrapper.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(current - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(current + 1);
    }
  });

  let touchStartX = 0;
  wrapper.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true }
  );
  wrapper.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1);
    },
    { passive: true }
  );

  el.appendChild(wrapper);
}