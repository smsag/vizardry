import { FrameworkDefinition } from "./types";

export function renderCanvas(
  framework: FrameworkDefinition,
  data: Record<string, string>,
  container: HTMLElement
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", framework.id);

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: framework.label, cls: "vizardry-title" });

  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", framework.gridTemplate);
  grid.style.setProperty("--vzd-template-mobile", framework.gridTemplateMobile);

  for (const blockDef of framework.blocks) {
    const block = grid.createEl("div", { cls: "vizardry-block" });
    block.style.gridArea = blockDef.area;
    block.setAttribute("data-area", blockDef.area);

    block.createEl("div", { text: blockDef.label, cls: "vizardry-block-label" });

    const content = data[blockDef.key] ?? "";
    const body = block.createEl("div", { cls: "vizardry-block-body" });

    if (content.trim() === "") {
      body.addClass("vizardry-block-empty");
    } else {
      // Render newlines as <br> within each line; preserve line breaks
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        body.appendText(line);
        if (idx < lines.length - 1) body.createEl("br");
      });
    }
  }

  // Mobile carousel state
  setupMobileCarousel(container, framework.blocks.length);
}

function setupMobileCarousel(container: HTMLElement, blockCount: number): void {
  let current = 0;

  const nav = container.createEl("div", { cls: "vizardry-nav" });
  const prev = nav.createEl("button", { cls: "vizardry-nav-btn", text: "‹" });
  const indicator = nav.createEl("span", { cls: "vizardry-nav-indicator" });
  const next = nav.createEl("button", { cls: "vizardry-nav-btn", text: "›" });

  function update(): void {
    const blocks = container.querySelectorAll<HTMLElement>(".vizardry-block");
    blocks.forEach((b, i) => {
      b.classList.toggle("vizardry-block-active", i === current);
    });
    indicator.textContent = `${current + 1} / ${blockCount}`;
    (prev as HTMLButtonElement).disabled = current === 0;
    (next as HTMLButtonElement).disabled = current === blockCount - 1;
  }

  prev.addEventListener("click", () => { if (current > 0) { current--; update(); } });
  next.addEventListener("click", () => { if (current < blockCount - 1) { current++; update(); } });

  // Touch swipe
  let touchStartX = 0;
  container.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  container.addEventListener("touchend", (e) => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      if (delta > 0 && current < blockCount - 1) { current++; update(); }
      else if (delta < 0 && current > 0) { current--; update(); }
    }
  }, { passive: true });

  update();
}

export function renderError(message: string, container: HTMLElement): void {
  container.addClass("vizardry-error");
  container.createEl("span", { cls: "vizardry-error-icon", text: "⚠" });
  container.createEl("span", { cls: "vizardry-error-message", text: message });
}
