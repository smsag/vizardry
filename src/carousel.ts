import { MarkdownPostProcessorContext, MarkdownView, Plugin, TFile } from "obsidian";

const BREAKER_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "HR", "TABLE", "PRE", "BLOCKQUOTE"]);
const BREAKER_SELECTOR = "h1,h2,h3,h4,h5,h6,hr,table,pre,blockquote";

// Marks source sections absorbed into a carousel so teardown can find them.
const MEMBER_ATTR = "data-vzd-carousel-member";

function isCarouselEnabled(ctx: MarkdownPostProcessorContext, plugin: Plugin): boolean {
  if (ctx.frontmatter !== undefined && ctx.frontmatter !== null) {
    return ctx.frontmatter.carousel === true;
  }
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return false;
  return plugin.app.metadataCache.getFileCache(file)?.frontmatter?.carousel === true;
}

// ── Teardown ─────────────────────────────────────────────────────────────────
// Removes all carousel wrappers and restores all hidden source sections.
// Called at the start of every buildCarousels so the function is idempotent
// regardless of how many times it runs or what state the DOM is in.

function teardownCarousels(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".vzd-carousel").forEach((el) => el.remove());
  container.querySelectorAll<HTMLElement>(`[${MEMBER_ATTR}]`).forEach((el) => {
    el.removeAttribute(MEMBER_ATTR);
    el.style.removeProperty("display");
  });
}

// ── Group detection ─────────────────────────────────────────────────────────

function buildCarousels(previewEl: HTMLElement): void {
  const container =
    previewEl.querySelector<HTMLElement>(".markdown-preview-sizer") ?? previewEl;

  // Full teardown first: restore source sections, remove stale carousel wrappers.
  // This is safe to call on every run — carousel wrappers are not Obsidian-managed,
  // and source sections are unhidden so the scan always starts from a clean DOM.
  teardownCarousels(container);

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
    const isBreaker =
      BREAKER_TAGS.has(block.tagName) ||
      block.querySelector(BREAKER_SELECTOR) !== null ||
      block.classList.contains("vizardry-canvas") ||
      block.querySelector(".vizardry-canvas") !== null;

    if (isBreaker) {
      flush();
      continue;
    }

    const imgs = Array.from(block.querySelectorAll<HTMLImageElement>("img")).filter(
      (img) => !img.closest(".vizardry-canvas")
    );

    if (imgs.length === 0) {
      flush();
      continue;
    }

    // Reject blocks that have text content alongside the images
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

  // Hide source sections instead of removing them.
  // Removing them breaks Obsidian's internal section registry: when sections
  // scroll into view or the view re-renders, Obsidian re-inserts new copies
  // of those sections, causing carousels to dissolve or duplicate.
  for (const section of sections) {
    section.setAttribute(MEMBER_ATTR, "true");
    section.style.display = "none";
  }

  const carousel = parent.createEl("div", { cls: "vzd-carousel" });
  carousel.setAttribute("tabindex", "0");
  carousel.setAttribute("role", "region");
  carousel.setAttribute("aria-label", `Image carousel, ${imgs.length} images`);

  const track = carousel.createEl("div", { cls: "vzd-carousel-track" });
  imgs.forEach((img, idx) => {
    const slide = track.createEl("div", {
      cls: idx === 0 ? "vzd-carousel-slide vzd-carousel-slide-active" : "vzd-carousel-slide",
    });
    slide.appendChild(img.cloneNode(true));
  });

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

  carousel.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goTo(current + 1); }
  });

  let touchStartX = 0;
  carousel.addEventListener("touchstart", (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  carousel.addEventListener("touchend", (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1);
  }, { passive: true });

  // Insert carousel immediately before the first hidden source section
  parent.insertBefore(carousel, first);
}

// ── Plugin registration ──────────────────────────────────────────────────────

function findPreviewContainer(plugin: Plugin, sourcePath: string): HTMLElement | null {
  let found: HTMLElement | null = null;
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    if (found) return;
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === sourcePath) {
      found = view.previewMode.containerEl;
    }
  });
  return found;
}

export function registerCarouselProcessor(plugin: Plugin): void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleRebuild(sourcePath: string, delay = 300): void {
    const existing = pending.get(sourcePath);
    if (existing !== undefined) clearTimeout(existing);

    const timer = setTimeout(() => {
      pending.delete(sourcePath);
      const previewEl = findPreviewContainer(plugin, sourcePath);
      if (previewEl && previewEl.isConnected) {
        buildCarousels(previewEl);
      } else if (delay < 2000) {
        // Single back-off retry if the view is not ready yet (mobile, slow transition)
        scheduleRebuild(sourcePath, delay * 2);
      }
    }, delay);

    pending.set(sourcePath, timer);
  }

  plugin.registerMarkdownPostProcessor(
    (_el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      if (!isCarouselEnabled(ctx, plugin)) return;
      scheduleRebuild(ctx.sourcePath);
    },
    100
  );

  plugin.register(() => {
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
  });
}

