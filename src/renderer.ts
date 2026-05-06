import { setIcon } from "obsidian";
import { FrameworkDefinition, ImpactMap, MindMap, MindMapNode, StoryMap, StoryTask, VennDiagram, VennItem } from "./types";

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

  const actorsWrap = tree.createEl("div", { cls: "vzd-im-actors-wrap" });

  if (map.actors.length === 0) {
    actorsWrap.createEl("div", { cls: "vzd-im-empty-placeholder", text: "No actors defined" });
    return;
  }

  for (const actor of map.actors) {
    const actorBranch = actorsWrap.createEl("div", { cls: "vzd-im-actor-branch" });
    const actorEl = actorBranch.createEl("div", { cls: "vzd-im-actor" });
    actorEl.createEl("span", { cls: "vzd-im-level-label", text: "Actor" });
    actorEl.createEl("div", { cls: "vzd-im-node-text", text: actor.name });

    const impactsWrap = actorBranch.createEl("div", { cls: "vzd-im-impacts-wrap" });

    if (actor.impacts.length === 0) {
      impactsWrap.createEl("div", { cls: "vzd-im-empty-placeholder", text: "No impacts defined" });
      continue;
    }

    for (const impact of actor.impacts) {
      const impactBranch = impactsWrap.createEl("div", { cls: "vzd-im-impact-branch" });
      const impactEl = impactBranch.createEl("div", { cls: "vzd-im-impact" });
      impactEl.createEl("span", { cls: "vzd-im-level-label", text: "Impact" });
      impactEl.createEl("div", { cls: "vzd-im-node-text", text: impact.name });

      const deliverablesWrap = impactBranch.createEl("div", { cls: "vzd-im-deliverables-wrap" });

      if (impact.deliverables.length === 0) {
        deliverablesWrap.createEl("div", { cls: "vzd-im-empty-placeholder", text: "No deliverables defined" });
        continue;
      }

      for (const deliverable of impact.deliverables) {
        const deliverableBranch = deliverablesWrap.createEl("div", { cls: "vzd-im-deliverable-branch" });
        const deliverableEl = deliverableBranch.createEl("div", { cls: "vzd-im-deliverable" });
        deliverableEl.createEl("span", { cls: "vzd-im-level-label", text: "Deliverable" });
        deliverableEl.createEl("div", { cls: "vzd-im-node-text", text: deliverable });
      }
    }
  }
}

export function renderStoryMap(map: StoryMap, container: HTMLElement): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", "story");

  // Header
  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "User Story Map", cls: "vizardry-title" });
  if (map.user || map.goal) {
    const meta = header.createEl("div", { cls: "vzd-story-meta" });
    if (map.user) meta.createEl("span", { cls: "vzd-story-meta-item", text: `User: ${map.user}` });
    if (map.goal) meta.createEl("span", { cls: "vzd-story-meta-item", text: `Goal: ${map.goal}` });
  }
  addPresentButton(header, container, "User Story Map");

  // Flatten all steps in document order — each becomes one grid column
  const allSteps = map.activities.flatMap(a => a.steps);
  const totalCols = allSteps.length;
  if (totalCols === 0) return;

  const grid = container.createEl("div", { cls: "vzd-story-grid" });
  grid.style.setProperty("--vzd-story-cols", String(totalCols));

  // Row 1: Activity headers, each spanning its steps
  // Track refs for the mobile step carousel: store original gridColumn so it can be restored.
  type ActivityHeaderRef = { el: HTMLElement; start: number; end: number; origGridCol: string };
  const activityHeaderRefs: ActivityHeaderRef[] = [];
  let colOffset = 1;
  let stepOffset = 0;
  for (const activity of map.activities) {
    const start = stepOffset;
    const origGridCol = `${colOffset} / span ${activity.steps.length}`;
    const el = grid.createEl("div", { cls: "vzd-story-activity-header", text: activity.name });
    el.style.gridColumn = origGridCol;
    el.dataset.origGridCol = origGridCol;
    activityHeaderRefs.push({ el, start, end: start + activity.steps.length - 1, origGridCol });
    colOffset += activity.steps.length;
    stepOffset += activity.steps.length;
  }

  // Row 2: Step headers — one per column, tagged with their step index
  const stepHeaderEls: HTMLElement[] = [];
  for (let i = 0; i < allSteps.length; i++) {
    const el = grid.createEl("div", { cls: "vzd-story-step-header", text: allSteps[i].name });
    el.dataset.stepCol = String(i);
    stepHeaderEls.push(el);
  }

  // Build set of all assigned task keys: "stepKey\0taskKey"
  const assignedKeys = new Set<string>();
  for (const slice of map.slices) {
    for (const [stepKey, taskKeys] of Object.entries(slice.cells)) {
      for (const taskKey of taskKeys) {
        assignedKeys.add(`${stepKey}\0${taskKey}`);
      }
    }
  }

  // Helper: append task cards into a cell element
  function appendCards(
    cell: HTMLElement,
    step: typeof allSteps[number],
    taskKeys: string[]
  ): void {
    for (const taskKey of taskKeys) {
      const task = step.tasks.find(t => t.name.toLowerCase().trim() === taskKey);
      if (!task) continue;
      const card = cell.createEl("div", { cls: "vzd-story-task-card" });
      card.createEl("div", { cls: "vzd-story-task-name", text: task.name });
      if (task.subtitle) {
        card.createEl("div", { cls: "vzd-story-task-subtitle", text: task.subtitle });
      }
    }
  }

  // cellsByStep[i] holds all cells (one per slice/backlog band) for step i
  const cellsByStep: HTMLElement[][] = Array.from({ length: totalCols }, () => []);

  // Slice bands
  for (const slice of map.slices) {
    grid.createEl("div", { cls: "vzd-story-slice-label", text: slice.name });

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      const stepKey = step.name.toLowerCase().trim();
      const taskKeys = slice.cells[stepKey] ?? [];
      const cell = grid.createEl("div", { cls: "vzd-story-cell" });
      cell.dataset.stepCol = String(i);
      if (taskKeys.length === 0) {
        cell.addClass("vzd-story-cell-empty");
      } else {
        appendCards(cell, step, taskKeys);
      }
      cellsByStep[i].push(cell);
    }
  }

  // Backlog band — tasks not assigned to any slice
  const backlogByStep = new Map<string, typeof allSteps[number]["tasks"]>();
  for (const step of allSteps) {
    const stepKey = step.name.toLowerCase().trim();
    const unassigned = step.tasks.filter(
      (t: StoryTask) => !assignedKeys.has(`${stepKey}\0${t.name.toLowerCase().trim()}`)
    );
    if (unassigned.length > 0) backlogByStep.set(stepKey, unassigned);
  }

  if (backlogByStep.size > 0) {
    const backlogLabel = grid.createEl("div", { cls: "vzd-story-slice-label", text: "Backlog" });
    backlogLabel.addClass("vzd-story-backlog-label");

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      const stepKey = step.name.toLowerCase().trim();
      const tasks = backlogByStep.get(stepKey) ?? [];
      const cell = grid.createEl("div", { cls: "vzd-story-cell" });
      cell.dataset.stepCol = String(i);
      if (tasks.length === 0) {
        cell.addClass("vzd-story-cell-empty");
      } else {
        for (const task of tasks) {
          const card = cell.createEl("div", { cls: "vzd-story-task-card" });
          card.createEl("div", { cls: "vzd-story-task-name", text: task.name });
          if (task.subtitle) {
            card.createEl("div", { cls: "vzd-story-task-subtitle", text: task.subtitle });
          }
        }
      }
      cellsByStep[i].push(cell);
    }
  }

  // Step metadata for carousel breadcrumb
  const stepMeta = allSteps.map((step, i) => {
    const activity = map.activities.find(a => a.steps.some(s => s === step))!;
    return { activityName: activity.name, stepName: step.name, index: i };
  });

  setupStoryCarousel(container, grid, stepMeta, activityHeaderRefs, stepHeaderEls, cellsByStep);
}

function setupStoryCarousel(
  container: HTMLElement,
  grid: HTMLElement,
  stepMeta: Array<{ activityName: string; stepName: string; index: number }>,
  activityHeaderRefs: Array<{ el: HTMLElement; start: number; end: number; origGridCol: string }>,
  stepHeaderEls: HTMLElement[],
  cellsByStep: HTMLElement[][]
): void {
  const total = stepMeta.length;
  if (total <= 1) return;

  let current = 0;
  const mq = window.matchMedia("(max-width: 600px)");

  const nav = container.createEl("div", { cls: "vzd-story-nav" });
  const prevBtn = nav.createEl("button", { cls: "vzd-story-nav-btn", text: "‹" }) as HTMLButtonElement;
  const label = nav.createEl("span", { cls: "vzd-story-nav-label" });
  const nextBtn = nav.createEl("button", { cls: "vzd-story-nav-btn", text: "›" }) as HTMLButtonElement;

  function applyMobile(col: number): void {
    grid.style.gridTemplateColumns = "1fr";

    activityHeaderRefs.forEach(({ el, start, end }) => {
      const active = col >= start && col <= end;
      el.style.display = active ? "" : "none";
      el.style.gridColumn = "1";
    });

    stepHeaderEls.forEach((el, i) => {
      el.style.display = i === col ? "" : "none";
      el.style.gridColumn = "1";
    });

    cellsByStep.forEach((cells, i) => {
      cells.forEach(cell => {
        cell.style.display = i === col ? "" : "none";
        cell.style.gridColumn = "1";
      });
    });

    const { activityName, stepName } = stepMeta[col];
    label.textContent = `${activityName} › ${stepName}`;
    prevBtn.disabled = col === 0;
    nextBtn.disabled = col === total - 1;
  }

  function resetLayout(): void {
    grid.style.gridTemplateColumns = "";
    activityHeaderRefs.forEach(({ el, origGridCol }) => {
      el.style.display = "";
      el.style.gridColumn = origGridCol;
    });
    stepHeaderEls.forEach(el => {
      el.style.display = "";
      el.style.gridColumn = "";
    });
    cellsByStep.forEach(cells => cells.forEach(cell => {
      cell.style.display = "";
      cell.style.gridColumn = "";
    }));
  }

  function goTo(n: number): void {
    current = Math.max(0, Math.min(n, total - 1));
    if (mq.matches) applyMobile(current);
  }

  const onMediaChange = (e: MediaQueryList | MediaQueryListEvent): void => {
    if (e.matches) {
      nav.style.display = "flex";
      applyMobile(current);
    } else {
      nav.style.display = "none";
      resetLayout();
    }
  };

  nav.style.display = "none";
  mq.addEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
  onMediaChange(mq);

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  let touchStartX = 0;
  grid.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  grid.addEventListener("touchend", (e) => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) goTo(delta > 0 ? current + 1 : current - 1);
  }, { passive: true });
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
  const btnGroup = pHeader.createEl("div", { cls: "vzd-presentation-btn-group" });
  const reloadBtn = btnGroup.createEl("button", { cls: "vzd-presentation-reload" });
  setIcon(reloadBtn, "refresh-cw");
  reloadBtn.setAttribute("aria-label", "Reload canvas");
  const closeBtn = btnGroup.createEl("button", { cls: "vzd-presentation-close" });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", "Exit presentation");

  // Content area
  const wrap = overlay.createEl("div", { cls: "vzd-presentation-wrap" });

  // Clone the rendered content into wrap, replacing any previous clone
  const loadContent = (): void => {
    wrap.empty();
    const contentEl = sourceContainer.querySelector<HTMLElement>(
      ".vizardry-grid, .vzd-im-tree, .vzd-story-grid, .vzd-venn-wrap"
    );
    if (contentEl) {
      const clone = contentEl.cloneNode(true) as HTMLElement;
      // Force all blocks visible — overrides mobile carousel display:none state
      clone.querySelectorAll(".vizardry-block").forEach(b => b.classList.add("vizardry-block-active"));
      // Restore full multi-column layout — overrides mobile story step carousel state
      if (clone.classList.contains("vzd-story-grid")) {
        clone.style.gridTemplateColumns = "";
        clone.querySelectorAll<HTMLElement>(".vzd-story-activity-header").forEach(el => {
          el.style.display = "";
          el.style.gridColumn = el.dataset.origGridCol ?? "";
        });
        clone.querySelectorAll<HTMLElement>(".vzd-story-step-header, .vzd-story-cell").forEach(el => {
          el.style.display = "";
          el.style.gridColumn = "";
        });
      }
      wrap.appendChild(clone);
    }
  };

  loadContent();

  reloadBtn.addEventListener("click", () => {
    reloadBtn.addClass("vzd-presentation-reload--spinning");
    loadContent();
    setTimeout(() => reloadBtn.removeClass("vzd-presentation-reload--spinning"), 400);
  });

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

// ── Venn Diagram ──────────────────────────────────────────────────────────────

export function renderVennDiagram(
  venn: VennDiagram,
  container: HTMLElement,
  openLink: (target: string) => void
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", "venn");

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Venn Diagram", cls: "vizardry-title" });
  addPresentButton(header, container, "Venn Diagram");

  const wrap = container.createEl("div", { cls: "vzd-venn-wrap" });
  const is3 = venn.circles.length === 3;

  function makeSvg(tag: string, attrs: Record<string, string>): SVGElement {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  const svg = makeSvg("svg", {
    viewBox: is3 ? "0 0 500 460" : "0 0 500 300",
    class: "vzd-venn-svg",
  });

  // Circle geometry: cx, cy, r, label position lx/ly
  type CircleGeo = { cx: number; cy: number; r: number; lx: number; ly: number };
  const geos: CircleGeo[] = is3
    ? [
        { cx: 250, cy: 165, r: 140, lx: 250, ly: 38  },  // A — top
        { cx: 338, cy: 315, r: 140, lx: 422, ly: 322 },  // B — bottom-right
        { cx: 162, cy: 315, r: 140, lx: 78,  ly: 322 },  // C — bottom-left
      ]
    : [
        { cx: 175, cy: 150, r: 130, lx: 128, ly: 44 },   // A — left
        { cx: 325, cy: 150, r: 130, lx: 372, ly: 44 },   // B — right
      ];

  geos.forEach((g, i) => {
    svg.appendChild(makeSvg("circle", {
      cx: String(g.cx), cy: String(g.cy), r: String(g.r),
      class: "vzd-venn-circle", "data-ci": String(i),
    }));
    const t = makeSvg("text", {
      x: String(g.lx), y: String(g.ly),
      class: "vzd-venn-circle-label", "text-anchor": "middle",
    });
    t.textContent = venn.circles[i].name;
    svg.appendChild(t);
  });

  wrap.appendChild(svg);

  // Region content positions as percentages of the viewBox dimensions.
  // Each entry: [left%, top%, maxWidth%]
  // 2-circle viewBox 500×300 — circles at cx=175/325, cy=150, r=130
  // 3-circle viewBox 500×460 — A(250,165) B(338,315) C(162,315), r=140
  type Pos = { l: number; t: number; w: number };
  const TWO: Record<string, Pos> = {
    "0":   { l: 27.5, t: 50,   w: 20 },
    "1":   { l: 72.5, t: 50,   w: 20 },
    "0+1": { l: 50,   t: 50,   w: 20 },
  };
  const THREE: Record<string, Pos> = {
    "0":     { l: 50,   t: 17,   w: 18 },
    "1":     { l: 75.6, t: 79.6, w: 18 },
    "2":     { l: 24.4, t: 79.6, w: 18 },
    "0+1":   { l: 60.4, t: 47.4, w: 14 },
    "0+2":   { l: 39.6, t: 47.4, w: 14 },
    "1+2":   { l: 50,   t: 75.7, w: 14 },
    "0+1+2": { l: 50,   t: 56.1, w: 13 },
  };
  const posMap = is3 ? THREE : TWO;

  for (const region of venn.regions) {
    if (region.items.length === 0) continue;
    const pos = posMap[region.key];
    if (!pos) continue;

    const div = wrap.createEl("div", { cls: "vzd-venn-region" });
    div.style.left = `${pos.l}%`;
    div.style.top = `${pos.t}%`;
    div.style.maxWidth = `${pos.w}%`;

    for (const item of region.items) {
      const itemEl = div.createEl("div", { cls: "vzd-venn-item" });
      if (item.linkTarget) {
        const link = itemEl.createEl("span", { cls: "vzd-venn-link", text: item.text });
        link.addEventListener("click", () => openLink((item as VennItem).linkTarget!));
      } else {
        itemEl.setText(item.text);
      }
    }
  }
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
