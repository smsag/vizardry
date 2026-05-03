import { MarkdownPostProcessorContext, MarkdownView, Plugin, TFile } from "obsidian";

const BREAKER_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "HR", "TABLE", "PRE", "BLOCKQUOTE"]);
const BREAKER_SELECTOR = "h1,h2,h3,h4,h5,h6,hr,table,pre,blockquote";
const MEMBER_ATTR = "data-vzd-carousel-member";

// ── Frontmatter check ────────────────────────────────────────────────────────

function isCarouselEnabled(ctx: MarkdownPostProcessorContext, plugin: Plugin): boolean {
  if (ctx.frontmatter !== undefined && ctx.frontmatter !== null) {
    return ctx.frontmatter.carousel === true;
  }
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return false;
  return plugin.app.metadataCache.getFileCache(file)?.frontmatter?.carousel === true;
}

// ── Teardown ─────────────────────────────────────────────────────────────────
// Removes carousel wrappers and restores hidden source sections.
// Only works on whatever is currently in the DOM — safe to call at any time.

function teardownCarousels(sizer: HTMLElement): void {
  sizer.querySelectorAll<HTMLElement>(".vzd-carousel").forEach((el) => el.remove());
  sizer.querySelectorAll<HTMLElement>(`[${MEMBER_ATTR}]`).forEach((el) => {
    el.removeAttribute(MEMBER_ATTR);
    el.style.removeProperty("display");
  });
}

// ── Group detection & carousel construction ──────────────────────────────────
// Works only with whatever sections are currently in the DOM.
// If image sections have been unloaded by Obsidian's virtual scroller,
// they simply won't be found — no carousel is built for that scroll position,
// which is correct (nothing to show). When they scroll back in, Obsidian
// re-inserts them, the MutationObserver fires, and they get wrapped again.

function buildCarousels(sizer: HTMLElement): void {
  teardownCarousels(sizer);

  const blocks = Array.from(sizer.children) as HTMLElement[];
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

    if (isBreaker) { flush(); continue; }

    const imgs = Array.from(block.querySelectorAll<HTMLImageElement>("img")).filter(
      (img) => !img.closest(".vizardry-canvas")
    );

    if (imgs.length === 0) { flush(); continue; }

    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("img").forEach((i) => i.remove());
    if ((clone.textContent?.trim() ?? "") !== "") { flush(); continue; }

    curNodes.push(block);
    curImgs.push(...imgs);
  }
  flush();

  for (const { nodes, imgs } of groups) {
    wrapAsCarousel(nodes, imgs, sizer);
  }
}

// ── Carousel DOM construction ─────────────────────────────────────────────────

function wrapAsCarousel(
  sections: HTMLElement[],
  imgs: HTMLImageElement[],
  parent: HTMLElement
): void {
  // Hide source sections — do NOT remove them.
  // Removing Obsidian-managed elements breaks its section registry.
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

  parent.insertBefore(carousel, sections[0]);
}

// ── Per-file observer state ───────────────────────────────────────────────────

interface FileCarouselState {
  sizer: HTMLElement;
  observer: MutationObserver;
  rebuildTimer: ReturnType<typeof setTimeout> | null;
}

function findSizer(plugin: Plugin, sourcePath: string): HTMLElement | null {
  let found: HTMLElement | null = null;
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    if (found) return;
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === sourcePath) {
      const c = view.previewMode.containerEl;
      found = c.querySelector<HTMLElement>(".markdown-preview-sizer") ?? c;
    }
  });
  return found;
}

// ── Plugin registration ───────────────────────────────────────────────────────

export function registerCarouselProcessor(plugin: Plugin): void {
  // Tracks the active MutationObserver + state per source file.
  const fileStates = new Map<string, FileCarouselState>();

  // Debounce timers for the initial setup (allows mode transition to complete).
  const setupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Schedule a debounced rebuild for a file. Disconnects the observer during
  // the synchronous buildCarousels call so our own DOM mutations don't re-trigger it.
  function scheduleRebuild(sourcePath: string): void {
    const state = fileStates.get(sourcePath);
    if (!state || !state.sizer.isConnected) return;
    if (state.rebuildTimer !== null) clearTimeout(state.rebuildTimer);

    state.rebuildTimer = setTimeout(() => {
      state.rebuildTimer = null;
      if (!state.sizer.isConnected) return;
      state.observer.disconnect();
      buildCarousels(state.sizer);
      state.observer.observe(state.sizer, { childList: true });
    }, 150);
  }

  // Attach a MutationObserver to the sizer for the given file.
  // Called (debounced) from the post-processor after mode transitions complete.
  function setupCarousel(sourcePath: string): void {
    setupTimers.delete(sourcePath);

    const sizer = findSizer(plugin, sourcePath);
    if (!sizer || !sizer.isConnected) {
      // View not ready yet (mid mode-transition) — retry once
      const t = setTimeout(() => setupCarousel(sourcePath), 400);
      setupTimers.set(sourcePath, t);
      return;
    }

    const existing = fileStates.get(sourcePath);

    if (existing) {
      if (existing.sizer === sizer) {
        // Same container — already observing. Just trigger a rebuild
        // (handles edit→read transition where the sizer element is reused).
        scheduleRebuild(sourcePath);
        return;
      }
      // The preview container was recreated — disconnect the stale observer.
      existing.observer.disconnect();
      if (existing.rebuildTimer !== null) clearTimeout(existing.rebuildTimer);
      fileStates.delete(sourcePath);
    }

    // Create state first so scheduleRebuild can find it inside the observer callback.
    const state: FileCarouselState = {
      sizer,
      observer: null!,
      rebuildTimer: null,
    };

    // Only rebuild when a mutation involves image-bearing, carousel, or member
    // nodes. Obsidian's virtual scroller inserts plain text sections as the user
    // scrolls to the bottom; those mutations must NOT trigger a rebuild — doing
    // so causes the sizer height to flicker (teardown unhides sections, rebuild
    // hides them again) which makes the scrollbar jump and creates a reload loop.
    state.observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => {
        const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
        return nodes.some(
          (n) =>
            n instanceof HTMLElement &&
            (n.querySelector("img") !== null ||
              n.hasAttribute(MEMBER_ATTR) ||
              n.classList.contains("vzd-carousel"))
        );
      });
      if (relevant) scheduleRebuild(sourcePath);
    });
    fileStates.set(sourcePath, state);

    // Initial build (sizer is ready and connected).
    buildCarousels(sizer);

    // Observe direct children of the sizer — that is where Obsidian inserts/removes
    // sections during lazy scroll rendering and document re-renders.
    state.observer.observe(sizer, { childList: true });
  }

  plugin.registerMarkdownPostProcessor(
    (_el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      if (!isCarouselEnabled(ctx, plugin)) return;

      const sp = ctx.sourcePath;
      const t = setupTimers.get(sp);
      if (t !== undefined) clearTimeout(t);

      // Debounce so we call setupCarousel once after the full render batch
      // (and after any mode transition is complete).
      const timer = setTimeout(() => setupCarousel(sp), 300);
      setupTimers.set(sp, timer);
    },
    100
  );

  plugin.register(() => {
    for (const t of setupTimers.values()) clearTimeout(t);
    setupTimers.clear();
    for (const state of fileStates.values()) {
      state.observer.disconnect();
      if (state.rebuildTimer !== null) clearTimeout(state.rebuildTimer);
    }
    fileStates.clear();
  });
}


