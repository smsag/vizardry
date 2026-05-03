import { setIcon } from "obsidian";
import { FrameworkDefinition, ImpactMap, MindMap, MindMapNode, StoryMap } from "./types";

export function renderCanvas(
  framework: FrameworkDefinition,
  data: Record<string, string>,
  links: Record<string, string>,
  container: HTMLElement,
  navigateTo: (heading: string) => void
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", framework.id);

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: framework.label, cls: "vizardry-title" });
  addPresentButton(header, container, framework.label);

  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", framework.gridTemplate);
  grid.style.setProperty("--vzd-columns", framework.gridColumns);
  grid.style.setProperty("--vzd-rows", framework.gridRows);

  for (const blockDef of framework.blocks) {
    // All data and link lookups use the lowercased block label as key
    const labelKey = blockDef.label.toLowerCase();

    const block = grid.createEl("div", { cls: "vizardry-block" });
    block.style.gridArea = blockDef.area;
    block.setAttribute("data-area", blockDef.area);

    const labelRow = block.createEl("div", { cls: "vizardry-block-label-row" });
    labelRow.createEl("span", { text: blockDef.label, cls: "vizardry-block-label" });

    const heading = links[labelKey];
    if (heading) {
      const linkBtn = labelRow.createEl("button", { cls: "vizardry-block-link-btn" });
      setIcon(linkBtn, "link");
      linkBtn.setAttribute("aria-label", `Jump to: ${heading}`);
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigateTo(heading);
      });
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

export function renderImpactMap(map: ImpactMap, container: HTMLElement): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", "impact");

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Impact Map", cls: "vizardry-title" });
  addPresentButton(header, container, "Impact Map");

  const tree = container.createEl("div", { cls: "vzd-im-tree" });

  const goalEl = tree.createEl("div", { cls: "vzd-im-goal" });
  goalEl.createEl("span", { cls: "vzd-im-level-label", text: "Goal" });
  goalEl.createEl("div", { cls: "vzd-im-node-text", text: map.goal });

  const actorsWrap = tree.createEl("div", { cls: "vzd-im-level vzd-im-actors-wrap" });

  if (map.actors.length === 0) {
    actorsWrap.createEl("div", { cls: "vzd-im-empty-placeholder", text: "No actors defined" });
    return;
  }

  for (const actor of map.actors) {
    const actorEl = actorsWrap.createEl("div", { cls: "vzd-im-actor" });
    actorEl.createEl("span", { cls: "vzd-im-level-label", text: "Actor" });
    actorEl.createEl("div", { cls: "vzd-im-node-text", text: actor.name });

    const impactsWrap = actorEl.createEl("div", { cls: "vzd-im-level vzd-im-impacts-wrap" });

    if (actor.impacts.length === 0) {
      impactsWrap.createEl("div", { cls: "vzd-im-empty-placeholder", text: "No impacts defined" });
      continue;
    }

    for (const impact of actor.impacts) {
      const impactEl = impactsWrap.createEl("div", { cls: "vzd-im-impact" });
      impactEl.createEl("span", { cls: "vzd-im-level-label", text: "Impact" });
      impactEl.createEl("div", { cls: "vzd-im-node-text", text: impact.name });

      const deliverablesWrap = impactEl.createEl("div", { cls: "vzd-im-level vzd-im-deliverables-wrap" });

      if (impact.deliverables.length === 0) {
        deliverablesWrap.createEl("div", { cls: "vzd-im-empty-placeholder", text: "No deliverables defined" });
        continue;
      }

      for (const deliverable of impact.deliverables) {
        const deliverableEl = deliverablesWrap.createEl("div", { cls: "vzd-im-deliverable" });
        deliverableEl.createEl("span", { cls: "vzd-im-level-label", text: "Deliverable" });
        deliverableEl.createEl("div", { cls: "vzd-im-node-text", text: deliverable });
      }
    }
  }
}

export function renderStoryMap(map: StoryMap, container: HTMLElement): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", "story");

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "User Story Map", cls: "vizardry-title" });
  addPresentButton(header, container, "User Story Map");

  const grid = container.createEl("div", { cls: "vzd-story-grid" });
  grid.style.setProperty("--vzd-story-cols", String(map.backbone.length));

  // Backbone header row — one cell per activity
  for (const activity of map.backbone) {
    grid.createEl("div", { cls: "vzd-story-backbone-item", text: activity });
  }

  // Slice rows
  for (const slice of map.slices) {
    // Full-width slice label spanning all columns
    grid.createEl("div", { cls: "vzd-story-slice-label", text: slice.name });

    // One cell per backbone activity (empty cell if not in this slice)
    for (const activity of map.backbone) {
      const key = activity.toLowerCase().trim();
      const content = slice.cells[key] ?? "";
      const cell = grid.createEl("div", { cls: "vzd-story-cell" });

      if (content.trim() === "") {
        cell.addClass("vzd-story-cell-empty");
      } else {
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          cell.appendText(line);
          if (idx < lines.length - 1) cell.createEl("br");
        });
      }
    }
  }
}

function addPresentButton(header: HTMLElement, sourceContainer: HTMLElement, title: string): void {
  const btn = header.createEl("button", { cls: "vizardry-present-btn" });
  setIcon(btn, "expand");
  btn.setAttribute("aria-label", "Present fullscreen");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPresentation(sourceContainer, title);
  });
}

function openPresentation(sourceContainer: HTMLElement, title: string): void {
  const overlay = document.body.createEl("div", { cls: "vzd-presentation-overlay" });

  // Header bar
  const pHeader = overlay.createEl("div", { cls: "vzd-presentation-header" });
  pHeader.createEl("span", { text: title, cls: "vzd-presentation-title" });
  const closeBtn = pHeader.createEl("button", { cls: "vzd-presentation-close" });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", "Exit presentation");

  // Content area
  const wrap = overlay.createEl("div", { cls: "vzd-presentation-wrap" });

  // Clone the rendered content — grid canvas, impact map tree, or story map grid
  const contentEl = sourceContainer.querySelector<HTMLElement>(
    ".vizardry-grid, .vzd-im-tree, .vzd-story-grid"
  );
  if (contentEl) {
    const clone = contentEl.cloneNode(true) as HTMLElement;
    // Force all blocks visible — overrides mobile carousel display:none state
    clone.querySelectorAll(".vizardry-block").forEach(b => b.classList.add("vizardry-block-active"));
    wrap.appendChild(clone);
  }

  const dismiss = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  };

  closeBtn.addEventListener("click", dismiss);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") dismiss();
  };
  document.addEventListener("keydown", onKeyDown);

  // Swipe down to dismiss on mobile
  let touchStartY = 0;
  overlay.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    if (e.changedTouches[0].clientY - touchStartY > 80) dismiss();
  }, { passive: true });
}

function setupMobileCarousel(container: HTMLElement, blockCount: number): void {
  let current = 0;

  const nav = container.createEl("div", { cls: "vizardry-nav" });
  const prev = nav.createEl("button", { cls: "vizardry-nav-btn", text: "‹" });

  const dotsWrap = nav.createEl("div", { cls: "vizardry-nav-dots" });
  const dots = Array.from({ length: blockCount }, () =>
    dotsWrap.createEl("span", { cls: "vizardry-nav-dot" })
  );

  const next = nav.createEl("button", { cls: "vizardry-nav-btn", text: "›" });

  function update(): void {
    const blocks = container.querySelectorAll<HTMLElement>(".vizardry-block");
    blocks.forEach((b, i) => b.classList.toggle("vizardry-block-active", i === current));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === current));
    (prev as HTMLButtonElement).disabled = current === 0;
    (next as HTMLButtonElement).disabled = current === blockCount - 1;
  }

  prev.addEventListener("click", () => { if (current > 0) { current--; update(); } });
  next.addEventListener("click", () => { if (current < blockCount - 1) { current++; update(); } });

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

// ── Mind Map ─────────────────────────────────────────────────────────────────

export function renderMindMap(map: MindMap, container: HTMLElement): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", "mindmap");

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Mind Map", cls: "vizardry-title" });

  const tree = container.createEl("div", { cls: "vzd-mm-tree" });

  const rootEl = tree.createEl("div", { cls: "vzd-mm-root" });
  rootEl.createEl("div", { cls: "vzd-mm-node-text", text: map.root.text });

  if (map.root.children.length > 0) {
    const childrenWrap = rootEl.createEl("div", { cls: "vzd-mm-level" });
    for (const child of map.root.children) {
      renderMindMapNode(child, childrenWrap, 1);
    }
  }
}

function renderMindMapNode(
  node: MindMapNode,
  parent: HTMLElement,
  depth: number
): void {
  const depthCls = depth <= 3 ? `vzd-mm-depth-${depth}` : "vzd-mm-depth-deep";
  const nodeEl = parent.createEl("div", { cls: `vzd-mm-node ${depthCls}` });
  nodeEl.createEl("div", { cls: "vzd-mm-node-text", text: node.text });

  if (node.children.length > 0) {
    const childrenWrap = nodeEl.createEl("div", { cls: "vzd-mm-level" });
    for (const child of node.children) {
      renderMindMapNode(child, childrenWrap, depth + 1);
    }
  }
}
