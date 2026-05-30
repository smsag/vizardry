import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { FrameworkDefinition } from "../types";
import { initCanvas, markInteractive } from "./controls";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected } from "../shared/lifecycle";
import { writeBlockContent } from "../shared/block-edit";
import { t } from "../i18n";

export function renderError(message: string, container: HTMLElement): void {
  container.addClass("vizardry-error");
  container.createEl("span", { cls: "vizardry-error-icon", text: "⚠" });
  container.createEl("span", { cls: "vizardry-error-message", text: message });
}

export function renderCanvas(
  framework: FrameworkDefinition,
  data: Record<string, string>,
  links: Record<string, string>,
  container: HTMLElement,
  navigateTo: (heading: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  initCanvas(container, framework.id, framework.label);

  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", framework.gridTemplate);
  grid.style.setProperty("--vzd-columns", framework.gridColumns);
  grid.style.setProperty("--vzd-rows", framework.gridRows);

  for (const blockDef of framework.blocks) {
    const labelKey = blockDef.label.toLowerCase();
    const block = grid.createEl("div", { cls: "vizardry-block" });
    block.style.gridArea = blockDef.area;
    block.setAttribute("data-area", blockDef.area);

    const labelRow = block.createEl("div", { cls: "vizardry-block-label-row" });
    labelRow.createEl("span", { text: blockDef.label, cls: "vizardry-block-label" });

    const heading = links[labelKey];
    if (heading) {
      const linkBtn = labelRow.createEl("button", { cls: "vizardry-block-link-btn vzd-btn" });
      setIcon(linkBtn, "link");
      linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
      linkBtn.dataset.heading = heading;
      markInteractive(linkBtn);
      linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
    }

    const content = data[labelKey] ?? "";
    const body = block.createEl("div", { cls: "vizardry-block-body" });

    renderBlockBody(body, content);

    if (app && ctx) {
      body.addClass("vzd-block-editable");
      body.setAttribute("title", t("edit.clickToEdit"));
      // Store current content in dataset so the click handler always reads the
      // latest value — capturing `content` in the closure would give the stale
      // render-time string after an optimistic re-render (#1).
      body.dataset.blockContent = content;
      body.addEventListener("click", () => {
        activateBlockEdit(body, blockDef.label, body.dataset.blockContent ?? "", app, ctx, container);
      });
    }
  }

  setupMobileCarousel(container, framework.blocks.length);
}

// ── Inline block editing ───────────────────────────────────────────────────

function renderBlockBody(body: HTMLElement, content: string): void {
  body.empty();
  // Keep dataset in sync so the click handler always has the latest content.
  body.dataset.blockContent = content;
  if (content.trim() === "") {
    body.addClass("vizardry-block-empty");
    body.removeClass("vzd-block-body--filled");
  } else {
    body.removeClass("vizardry-block-empty");
    body.addClass("vzd-block-body--filled");
    content.split("\n").forEach(line => {
      body.createEl("div", { cls: "vzd-block-line", text: line });
    });
  }
}

function activateBlockEdit(
  body: HTMLElement,
  blockLabel: string,
  currentContent: string,
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): void {
  // Prevent re-entrancy
  if (body.hasClass("vzd-block-editing")) return;
  body.addClass("vzd-block-editing");
  body.removeClass("vizardry-block-empty");
  body.empty();

  const textarea = body.createEl("textarea", { cls: "vzd-block-textarea" });
  textarea.value = currentContent.trim();

  // Auto-size height to content
  const resize = (): void => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  resize();
  textarea.addEventListener("input", resize);

  // Focus and place cursor at end
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;

  const commit = (): void => {
    if (committed) return;
    committed = true;

    const newValue = textarea.value;
    const written = writeBlockContent(app, ctx, container, blockLabel, newValue);

    body.removeClass("vzd-block-editing");

    if (!written) {
      // Read-only mode or couldn't locate block — just re-render with the
      // original content so the canvas doesn't break
      renderBlockBody(body, currentContent);
      return;
    }

    // Optimistically re-render so the canvas updates immediately before
    // Obsidian triggers a full re-render from the source change.
    // renderBlockBody also updates body.dataset.blockContent, so the next
    // click will use the correct value.
    renderBlockBody(body, newValue.trim());
  };

  textarea.addEventListener("blur", commit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Discard — restore original content
      committed = true;
      body.removeClass("vzd-block-editing");
      renderBlockBody(body, currentContent);
    }
    // Allow Tab to insert spaces rather than moving focus
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + "  " + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      resize();
    }
  });
}

// ── Mobile carousel ────────────────────────────────────────────────────────

function setupMobileCarousel(container: HTMLElement, blockCount: number): void {
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
    // On desktop, all blocks are always visible — remove carousel state.
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

  // Touch swipe — only active in mobile mode (when nav is visible).
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

  // Clean up both the MediaQueryList listener and the touch listeners when the
  // container leaves the DOM, preventing accumulation across re-renders.
  onDisconnected(container, () => {
    mq.removeEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchend", onTouchEnd);
  });
}
