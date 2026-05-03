import { App, MarkdownPostProcessorContext, Plugin, TFile } from "obsidian";

// Tags whose presence ends an image group
const BREAKER_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "HR", "TABLE", "PRE", "BLOCKQUOTE"]);
const BREAKER_SELECTOR = "h1,h2,h3,h4,h5,h6,hr,table,pre,blockquote";

function isCarouselEnabled(ctx: MarkdownPostProcessorContext, app: App): boolean {
  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return false;
  return app.metadataCache.getFileCache(file)?.frontmatter?.carousel === true;
}

// ── Group detection ─────────────────────────────────────────────────────────

function buildCarousels(previewEl: HTMLElement): void {
  // Support both .markdown-preview-sizer wrapper and bare preview containers
  const container =
    previewEl.querySelector<HTMLElement>(".markdown-preview-sizer") ?? previewEl;

  // Snapshot children before any DOM mutations
  const blocks = Array.from(container.children) as HTMLElement[];

  const groups: Array<{ nodes: HTMLElement[]; imgs: HTMLImageElement[] }> = [];
  let curNodes: HTMLElement[] = [];
  let curImgs: HTMLImageElement[] = [];

  function flush(): void {
    if (curImgs.length >= 2) {
      groups.push({ nodes: [...curNodes], imgs: [...curImgs] });
    }
    curNodes = [];
    curImgs = [];
  }

  for (const block of blocks) {
    // Skip already-processed carousels (idempotency guard)
    if (block.classList.contains("vzd-carousel")) {
      flush();
      continue;
    }

    // Group breaker: known breaker tag, or contains a breaker, or vizardry canvas
    const isBreaker =
      BREAKER_TAGS.has(block.tagName) ||
      block.querySelector(BREAKER_SELECTOR) !== null ||
      block.classList.contains("vizardry-canvas") ||
      block.querySelector(".vizardry-canvas") !== null;

    if (isBreaker) {
      flush();
      continue;
    }

    // Collect images not inside vizardry canvases
    const imgs = Array.from(block.querySelectorAll<HTMLImageElement>("img")).filter(
      (img) => !img.closest(".vizardry-canvas") && !img.closest(".vzd-carousel")
    );

    if (imgs.length === 0) {
      flush();
      continue;
    }

    // Reject if any text content exists outside the img elements
    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("img").forEach((i) => i.remove());
    if ((clone.textContent?.trim() ?? "") !== "") {
      flush();
      continue;
    }

    curNodes.push(block);
    curImgs.push(...imgs);
  }
  flush();

  for (const group of groups) {
    wrapAsCarousel(group.nodes, group.imgs, container);
  }
}

// ── Carousel DOM construction ────────────────────────────────────────────────

function wrapAsCarousel(
  sections: HTMLElement[],
  imgs: HTMLImageElement[],
  parent: HTMLElement
): void {
  const first = sections[0];

  // Root container — focusable for keyboard nav
  const carousel = parent.createEl("div", { cls: "vzd-carousel" });
  carousel.setAttribute("tabindex", "0");
  carousel.setAttribute("role", "region");
  carousel.setAttribute("aria-label", `Image carousel, ${imgs.length} images`);

  // Slide track
  const track = carousel.createEl("div", { cls: "vzd-carousel-track" });
  imgs.forEach((img, idx) => {
    const slide = track.createEl("div", {
      cls: idx === 0 ? "vzd-carousel-slide vzd-carousel-slide-active" : "vzd-carousel-slide",
    });
    // Clone so we don't move the original out of the section before removal
    slide.appendChild(img.cloneNode(true));
  });

  // Controls row: ‹ · · · ›
  const controls = carousel.createEl("div", { cls: "vzd-carousel-controls" });

  const prevBtn = controls.createEl("button", { cls: "vzd-carousel-btn" });
  prevBtn.setAttribute("aria-label", "Previous image");
  prevBtn.appendText("‹");

  const dotsWrap = controls.createEl("div", { cls: "vzd-carousel-dots" });
  const dots = imgs.map((_, idx) => {
    const dot = dotsWrap.createEl("button", {
      cls: idx === 0 ? "vzd-carousel-dot vzd-carousel-dot-active" : "vzd-carousel-dot",
    });
    dot.setAttribute("aria-label", `Go to image ${idx + 1}`);
    return dot;
  });

  const nextBtn = controls.createEl("button", { cls: "vzd-carousel-btn" });
  nextBtn.setAttribute("aria-label", "Next image");
  nextBtn.appendText("›");

  // ── Navigation state ────────────────────────────────────────────
  const slides = Array.from(track.children) as HTMLElement[];
  let current = 0;

  function goTo(next: number): void {
    slides[current].removeClass("vzd-carousel-slide-active");
    dots[current].removeClass("vzd-carousel-dot-active");
    current = ((next % imgs.length) + imgs.length) % imgs.length;
    slides[current].addClass("vzd-carousel-slide-active");
    dots[current].addClass("vzd-carousel-dot-active");
  }

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
  dots.forEach((dot, idx) => dot.addEventListener("click", () => goTo(idx)));

  // Keyboard: scoped to carousel when focused
  carousel.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(current - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(current + 1);
    }
  });

  // Touch/swipe support
  let touchStartX = 0;
  carousel.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    },
    { passive: true }
  );
  carousel.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1);
    },
    { passive: true }
  );

  // Insert carousel before first original section, then remove all sections
  parent.insertBefore(carousel, first);
  for (const section of sections) {
    parent.removeChild(section);
  }
}

// ── Plugin registration ──────────────────────────────────────────────────────

export function registerCarouselProcessor(plugin: Plugin): void {
  // Debounce one scan per render cycle per document view
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  plugin.registerMarkdownPostProcessor(
    (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      if (!isCarouselEnabled(ctx, (plugin as Plugin & { app: App }).app)) return;

      const previewEl = el.closest<HTMLElement>(".markdown-preview-view");
      if (!previewEl) return;

      const docId = ctx.docId;
      const existing = pending.get(docId);
      if (existing !== undefined) clearTimeout(existing);

      const timer = setTimeout(() => {
        pending.delete(docId);
        if (!previewEl.isConnected) return;
        buildCarousels(previewEl);
      }, 50);

      pending.set(docId, timer);
    },
    // Higher priority number = runs after canvas code-block processors
    100
  );

  // Clean up any outstanding timers on plugin unload
  plugin.register(() => {
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
  });
}
