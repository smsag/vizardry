import { setIcon } from "obsidian";
import type { FrameworkDefinition } from "../types";
import { initCanvas, markInteractive } from "./controls";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";

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
  navigateTo: (heading: string) => void
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

    if (content.trim() === "") {
      body.addClass("vizardry-block-empty");
    } else {
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        body.appendText(line);
        if (idx < lines.length - 1) body.createEl("br");
      });
    }
  }

  setupMobileCarousel(container, framework.blocks.length);
}

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
