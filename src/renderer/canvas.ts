import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { FrameworkDefinition } from "../types";
import { initCanvas, markInteractive } from "./controls";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { writeBlockContent } from "../shared/block-edit";

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
      linkBtn.setAttribute("aria-label", `Jump to: ${heading}`);
      linkBtn.dataset.heading = heading;
      markInteractive(linkBtn);
      linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
    }

    const content = data[labelKey] ?? "";
    const body = block.createEl("div", { cls: "vizardry-block-body" });

    renderBlockBody(body, content);

    if (app && ctx) {
      body.addClass("vzd-block-editable");
      body.setAttribute("title", "Click to edit");
      body.addEventListener("click", () => activateBlockEdit(body, blockDef.label, content, app, ctx, container));
    }
  }

  setupMobileCarousel(container, framework.blocks.length);
}

// ── Inline block editing ───────────────────────────────────────────────────

function renderBlockBody(body: HTMLElement, content: string): void {
  body.empty();
  if (content.trim() === "") {
    body.addClass("vizardry-block-empty");
    body.removeClass("vzd-block-body--filled");
  } else {
    body.removeClass("vizardry-block-empty");
    body.addClass("vzd-block-body--filled");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      body.appendText(line);
      if (idx < lines.length - 1) body.createEl("br");
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
    // Obsidian triggers a full re-render from the source change
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

  const nav = container.createEl("div", { cls: "vizardry-nav" });
  const prev = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(prev, "chevron-left");
  prev.setAttribute("aria-label", "Previous block");

  const dotsWrap = nav.createEl("div", { cls: "vizardry-nav-dots" });
  const dots = Array.from({ length: blockCount }, () =>
    dotsWrap.createEl("span", { cls: "vizardry-nav-dot" })
  );

  const next = nav.createEl("button", { cls: "vizardry-nav-btn vzd-btn" });
  setIcon(next, "chevron-right");
  next.setAttribute("aria-label", "Next block");

  function update(): void {
    container.querySelectorAll<HTMLElement>(".vizardry-block").forEach((b, i) =>
      b.classList.toggle("vizardry-block-active", i === current)
    );
    dots.forEach((d, i) => d.classList.toggle("is-active", i === current));
    prev.disabled = current === 0;
    next.disabled = current === blockCount - 1;
  }

  prev.addEventListener("click", () => { if (current > 0) { current--; update(); } });
  next.addEventListener("click", () => { if (current < blockCount - 1) { current++; update(); } });

  let touchStartX = 0;
  container.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  container.addEventListener("touchend", (e) => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      if (delta > 0 && current < blockCount - 1) { current++; update(); }
      else if (delta < 0 && current > 0) { current--; update(); }
    }
  }, { passive: true });

  update();
}
