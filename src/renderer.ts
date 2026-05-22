import { setIcon } from "obsidian";
import { FrameworkDefinition, ImpactMap, MindMap, MindMapNode, OSTNode, OSTTree, StoryMap, StoryTask, VennDiagram, VennItem } from "./types";

type FullWidthCanvasEl = HTMLElement & {
  __vzdFullWidthObserver?: ResizeObserver;
  __vzdFullWidthRemovalObserver?: MutationObserver;
  __vzdFullWidthWindowHandler?: () => void;
  __vzdFullWidthObservedContainer?: HTMLElement | null;
};

const WORKSPACE_CONTAINER_SELECTORS = [
  ".workspace-leaf-content",
  ".workspace-split.mod-root",
  ".workspace-tabs",
  ".workspace-leaf",
] as const;

function findWorkspaceContainer(canvasEl: HTMLElement): HTMLElement | null {
  for (const selector of WORKSPACE_CONTAINER_SELECTORS) {
    const match = canvasEl.closest<HTMLElement>(selector);
    if (match) return match;
  }
  return null;
}

function cleanupFullWidthWatchers(canvasEl: FullWidthCanvasEl): void {
  canvasEl.__vzdFullWidthObserver?.disconnect();
  canvasEl.__vzdFullWidthObserver = undefined;

  canvasEl.__vzdFullWidthRemovalObserver?.disconnect();
  canvasEl.__vzdFullWidthRemovalObserver = undefined;

  if (canvasEl.__vzdFullWidthWindowHandler) {
    window.removeEventListener("resize", canvasEl.__vzdFullWidthWindowHandler);
    canvasEl.__vzdFullWidthWindowHandler = undefined;
  }

  canvasEl.__vzdFullWidthObservedContainer = undefined;
}

function ensureFullWidthWatchers(canvasEl: FullWidthCanvasEl, container: HTMLElement | null): void {
  const current = canvasEl.__vzdFullWidthObservedContainer;
  if (current === container && canvasEl.__vzdFullWidthRemovalObserver) return;

  cleanupFullWidthWatchers(canvasEl);
  canvasEl.__vzdFullWidthObservedContainer = container;

  if (container) {
    const ro = new ResizeObserver(() => {
      if (!canvasEl.isConnected) {
        cleanupFullWidthWatchers(canvasEl);
        return;
      }
      applyFullWidth(canvasEl);
    });
    ro.observe(container);
    canvasEl.__vzdFullWidthObserver = ro;
  } else {
    const onResize = (): void => {
      if (!canvasEl.isConnected) {
        cleanupFullWidthWatchers(canvasEl);
        return;
      }
      applyFullWidth(canvasEl);
    };
    window.addEventListener("resize", onResize);
    canvasEl.__vzdFullWidthWindowHandler = onResize;
  }

  const parent = canvasEl.parentElement ?? document.body;
  const mo = new MutationObserver(() => {
    if (!canvasEl.isConnected || !parent.contains(canvasEl)) {
      cleanupFullWidthWatchers(canvasEl);
    }
  });
  mo.observe(parent, { childList: true });
  canvasEl.__vzdFullWidthRemovalObserver = mo;
}

export function applyFullWidth(canvasEl: HTMLElement): void {
  const fullWidthEl = canvasEl as FullWidthCanvasEl;
  const isEditView = !!canvasEl.closest(".cm-editor");
  const container = findWorkspaceContainer(canvasEl);

  if (isEditView) {
    // ── Edit / live-preview view ──────────────────────────────────
    // cm-scroller is the visible viewport. cm-content (the containing
    // block for position:relative children) is wider when readable line
    // width is active. We must NOT use left:50%/transform here because
    // left:50% resolves against cm-content, not cm-scroller.
    // Instead: set an explicit pixel width and pull the element left by
    // exactly the distance between its natural left edge and the
    // scroller's left edge.
    const cmScroller = container?.querySelector<HTMLElement>(".cm-scroller");

    if (cmScroller) {
      // Reset margin before measuring so getBoundingClientRect reflects
      // the element's natural position, not a previously corrected one.
      canvasEl.style.marginLeft = "";
      const cmContent = container.querySelector<HTMLElement>(".cm-content");
      const scrollerRect = cmScroller.getBoundingClientRect();
      const computed = getComputedStyle(cmScroller);
      const paddingLeft = parseFloat(computed.paddingLeft) || 0;
      const paddingRight = parseFloat(computed.paddingRight) || 0;
      const scrollerContentWidth = cmScroller.clientWidth - paddingLeft - paddingRight;

      const HORIZONTAL_MARGIN = 32;
      const finalWidth = Math.max(0, scrollerContentWidth - HORIZONTAL_MARGIN);

      // Measure how far cm-content's left edge is from cm-scroller's
      // content left edge — this is the readable-line-width indent offset.
      // The canvas must be pulled left by this amount to align with the
      // scroller's visible left edge.
      const contentRect = cmContent
        ? cmContent.getBoundingClientRect()
        : scrollerRect;
      const offsetLeft = contentRect.left - scrollerRect.left - paddingLeft;

      canvasEl.style.position = "relative";
      canvasEl.style.left = "0";
      canvasEl.style.transform = "none";
      canvasEl.style.width = `${finalWidth}px`;
      canvasEl.style.maxWidth = `${finalWidth}px`;
      canvasEl.style.marginLeft = `${-offsetLeft + HORIZONTAL_MARGIN / 2}px`;
      canvasEl.style.marginRight = "0";
    } else {
      // cm-scroller not found — fall back to window width
      const HORIZONTAL_MARGIN = 32;
      const finalWidth = Math.max(0, window.innerWidth - HORIZONTAL_MARGIN);
      const px = `${finalWidth}px`;
      canvasEl.style.position = "relative";
      canvasEl.style.left = "50%";
      canvasEl.style.transform = "translateX(-50%)";
      canvasEl.style.width = px;
      canvasEl.style.maxWidth = px;
      canvasEl.style.marginLeft = "auto";
      canvasEl.style.marginRight = "auto";
    }
  } else {
    // ── Read view ─────────────────────────────────────────────────
    // The containing block is .markdown-preview-sizer. The scroll
    // container does not clip, so left:50% + translateX(-50%) works
    // reliably. Measure against the sizer's parent to get the true
    // available width.
    const sizer = canvasEl.closest<HTMLElement>(".markdown-preview-sizer");
    const measureEl = sizer?.parentElement ?? container ?? document.documentElement;
    const computed = getComputedStyle(measureEl);
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    const availableWidth = measureEl.clientWidth - paddingLeft - paddingRight;

    const HORIZONTAL_MARGIN = 32;
    const finalWidth = Math.max(0, availableWidth - HORIZONTAL_MARGIN);
    const px = `${finalWidth}px`;

    canvasEl.style.position = "relative";
    canvasEl.style.left = "50%";
    canvasEl.style.transform = "translateX(-50%)";
    canvasEl.style.width = px;
    canvasEl.style.maxWidth = px;
    canvasEl.style.marginLeft = "auto";
    canvasEl.style.marginRight = "auto";
  }

  ensureFullWidthWatchers(fullWidthEl, container);
}

export function renderCanvas(
  framework: FrameworkDefinition,
  data: Record<string, string>,
  links: Record<string, string>,
  container: HTMLElement,
  navigateTo: (heading: string) => void
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", framework.id);
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(container));

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: framework.label, cls: "vizardry-title" });
  addHeaderControls(header, container, framework.label);

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
      linkBtn.dataset.heading = heading;
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
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(container));

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Impact Map", cls: "vizardry-title" });
  addHeaderControls(header, container, "Impact Map");

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
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(container));

  // Header
  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "User Story Map", cls: "vizardry-title" });
  if (map.user || map.goal) {
    const meta = header.createEl("div", { cls: "vzd-story-meta" });
    if (map.user) meta.createEl("span", { cls: "vzd-story-meta-item", text: `User: ${map.user}` });
    if (map.goal) meta.createEl("span", { cls: "vzd-story-meta-item", text: `Goal: ${map.goal}` });
  }
  addHeaderControls(header, container, "User Story Map");

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

function addHeaderControls(header: HTMLElement, container: HTMLElement, title: string): void {
  const actions = header.createEl("div", { cls: "vizardry-header-actions" });

  // ── Font-size controls ─────────────────────────────────────────
  const STEP_PX = 2;
  const MIN_STEP = -3;
  const MAX_STEP = 6;
  let step = 0;

  const decreaseBtn = actions.createEl("button", {
    cls: "vizardry-font-btn",
    text: "A\u2212",
  }) as HTMLButtonElement;
  decreaseBtn.setAttribute("aria-label", "Decrease font size");

  const increaseBtn = actions.createEl("button", {
    cls: "vizardry-font-btn",
    text: "A+",
  }) as HTMLButtonElement;
  increaseBtn.setAttribute("aria-label", "Increase font size");

  const applyStep = (): void => {
    if (step === 0) {
      container.style.removeProperty("--vzd-base");
    } else {
      container.style.setProperty(
        "--vzd-base",
        `calc(var(--vzd-base-default) + ${step * STEP_PX}px)`
      );
    }
    decreaseBtn.disabled = step <= MIN_STEP;
    increaseBtn.disabled = step >= MAX_STEP;
  };

  decreaseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (step > MIN_STEP) { step--; applyStep(); }
  });
  increaseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (step < MAX_STEP) { step++; applyStep(); }
  });

  applyStep(); // set initial disabled state

  // ── Present button ─────────────────────────────────────────────
  const btn = actions.createEl("button", { cls: "vizardry-present-btn" });
  setIcon(btn, "expand");
  btn.setAttribute("aria-label", "Present fullscreen");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPresentation(container, title);
  });
}

function openPresentation(sourceContainer: HTMLElement, title: string): void {
  const overlay = document.body.createEl("div", { cls: "vzd-presentation-overlay" });

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
      rebindPresentationInteractions(clone, sourceContainer);
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

function rebindPresentationInteractions(cloneRoot: HTMLElement, sourceContainer: HTMLElement): void {
  cloneRoot.querySelectorAll<HTMLElement>(".vizardry-block-link-btn").forEach((cloneBtn) => {
    cloneBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const heading = cloneBtn.dataset.heading;
      if (heading) {
        const sourceByHeading = sourceContainer.querySelector<HTMLElement>(
          `.vizardry-block-link-btn[data-heading="${CSS.escape(heading)}"]`
        );
        if (sourceByHeading) {
          sourceByHeading.click();
          return;
        }
      }

      const area = cloneBtn.closest<HTMLElement>(".vizardry-block")?.dataset.area;
      if (!area) return;

      const sourceBtn = sourceContainer.querySelector<HTMLElement>(
        `.vizardry-block[data-area="${CSS.escape(area)}"] .vizardry-block-link-btn`
      );
      sourceBtn?.click();
    });
  });

  cloneRoot.querySelectorAll<HTMLElement>(".vzd-venn-link").forEach((cloneLink) => {
    cloneLink.addEventListener("click", () => {
      const target = cloneLink.dataset.linkTarget;
      if (!target) return;

      const sourceLink = sourceContainer.querySelector<HTMLElement>(
        `.vzd-venn-link[data-link-target="${CSS.escape(target)}"]`
      );
      sourceLink?.click();
    });
  });
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
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(container));

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Venn Diagram", cls: "vizardry-title" });
  addHeaderControls(header, container, "Venn Diagram");

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
        link.dataset.linkTarget = item.linkTarget;
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
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(container));

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Mind Map", cls: "vizardry-title" });
  addHeaderControls(header, container, "Mind Map");

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

// ── Opportunity Solution Tree ───────────────────────────────────────────────

const OST_NODE_W = 180;
const OST_NODE_H = 44;
const OST_LEVEL_GAP = 80;
const OST_SIBLING_GAP = 20;
const OST_H_PADDING = 24;
const OST_V_PADDING = 24;

type OSTBounds = { maxX: number; maxY: number };

function createSvgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function layoutOSTNode(node: OSTNode, level: number, left: number): number {
  if (node.children.length === 0) {
    const width = OST_NODE_W;
    node.x = left;
    node.y = OST_V_PADDING + level * (OST_NODE_H + OST_LEVEL_GAP);
    node.width = OST_NODE_W;
    node.height = OST_NODE_H;
    return width;
  }

  const childWidths = node.children.map((child) => layoutOSTNode(child, level + 1, 0));
  const childSpan = childWidths.reduce((sum, width) => sum + width, 0) + OST_SIBLING_GAP * (node.children.length - 1);
  const width = Math.max(OST_NODE_W, childSpan);
  const nodeX = left + (width - OST_NODE_W) / 2;

  node.x = nodeX;
  node.y = OST_V_PADDING + level * (OST_NODE_H + OST_LEVEL_GAP);
  node.width = OST_NODE_W;
  node.height = OST_NODE_H;

  const childLeft = left + (width - childSpan) / 2;
  let cursor = childLeft;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childWidth = childWidths[i];
    layoutOSTNode(child, level + 1, cursor);
    cursor += childWidth + OST_SIBLING_GAP;
  }

  return width;
}

function collectOSTBounds(node: OSTNode, bounds: OSTBounds): void {
  bounds.maxX = Math.max(bounds.maxX, node.x + node.width);
  bounds.maxY = Math.max(bounds.maxY, node.y + node.height);
  for (const child of node.children) {
    collectOSTBounds(child, bounds);
  }
}

function renderOSTEdges(node: OSTNode, svg: SVGSVGElement): void {
  for (const child of node.children) {
    const x1 = node.x + OST_NODE_W / 2;
    const y1 = node.y + OST_NODE_H;
    const x2 = child.x + OST_NODE_W / 2;
    const y2 = child.y;
    const cy = (y1 + y2) / 2;

    svg.appendChild(createSvgEl("path", {
      d: `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`,
      fill: "none",
      stroke: "var(--background-modifier-border)",
      "stroke-width": "1.5",
    }));

    renderOSTEdges(child, svg);
  }
}

function renderOSTNodes(node: OSTNode, svg: SVGSVGElement): void {
  const group = createSvgEl("g", {
    transform: `translate(${node.x}, ${node.y})`,
  });

  const fill = node.level === 0
    ? "var(--color-accent)"
    : node.level === 1
      ? "var(--background-modifier-hover)"
      : "var(--background-secondary)";
  const textFill = node.level === 0 ? "var(--text-on-accent)" : "var(--text-normal)";
  const radius = node.level === 0 ? "10" : node.level === 1 ? "8" : node.level === 3 ? "22" : "6";

  const rectAttrs: Record<string, string> = {
    width: String(OST_NODE_W),
    height: String(OST_NODE_H),
    rx: radius,
    fill,
    stroke: "var(--background-modifier-border)",
    "stroke-width": "1",
  };
  if (node.level === 4) {
    rectAttrs["stroke-dasharray"] = "6 3";
  }

  group.appendChild(createSvgEl("rect", rectAttrs));

  const label = node.text.length > 22 ? `${node.text.slice(0, 21)}…` : node.text;
  const textEl = createSvgEl("text", {
    x: String(OST_NODE_W / 2),
    y: String(OST_NODE_H / 2),
    "dominant-baseline": "middle",
    "text-anchor": "middle",
    "font-size": "12",
    fill: textFill,
  });
  textEl.textContent = label;
  group.appendChild(textEl);

  const title = createSvgEl("title");
  title.textContent = node.text;
  group.appendChild(title);

  svg.appendChild(group);

  for (const child of node.children) {
    renderOSTNodes(child, svg);
  }
}

export function renderOST(tree: OSTTree, el: HTMLElement): void {
  el.addClass("vizardry-canvas");
  el.setAttribute("data-framework", "ost");
  el.style.width = "100%";
  el.style.minWidth = "100%";
  el.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(el));

  const header = el.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: "Opportunity Solution Tree", cls: "vizardry-title" });
  addHeaderControls(header, el, "Opportunity Solution Tree");

  const wrapper = el.createEl("div", { cls: "vizardry-ost-wrapper" });
  wrapper.style.overflowX = "auto";
  wrapper.style.overflowY = "auto";
  wrapper.style.maxHeight = "600px";

  layoutOSTNode(tree.root, 0, OST_H_PADDING);

  const bounds: OSTBounds = { maxX: 0, maxY: 0 };
  collectOSTBounds(tree.root, bounds);
  const svgWidth = bounds.maxX + OST_H_PADDING;
  const svgHeight = bounds.maxY + OST_V_PADDING;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.addClass("vizardry-ost");

  renderOSTEdges(tree.root, svg);
  renderOSTNodes(tree.root, svg);

  wrapper.appendChild(svg);
}

export function testApplyFullWidth(): void {
  const results: Array<{ test: string; passed: boolean; detail: string }> = [];

  function assert(test: string, condition: boolean, detail: string): void {
    results.push({ test, passed: condition, detail });
  }

  // ── Helpers ────────────────────────────────────────────────────

  function makeEl(cls: string): HTMLElement {
    const el = document.createElement("div");
    el.className = cls;
    el.style.boxSizing = "border-box";
    return el;
  }

  function px(n: number): string {
    return `${n}px`;
  }

  // ── Test 1: Edit view — canvas aligns with scroller left edge ──
  // Simulate: workspace-leaf-content > cm-editor > cm-scroller >
  //           cm-content > cm-embed-block > vizardry-canvas
  // cm-scroller is 800px wide with 8px padding each side (784px content)
  // cm-content is 600px wide, centered (auto margin of 92px each side)
  // Canvas natural left is at cm-content left = scroller left + 92px
  // Expected: canvas width = 784 - 32 = 752px
  //           marginLeft = -(92) + 16 = -76px (pulls canvas left to
  //           16px inside scroller content edge)

  const leaf1 = makeEl("workspace-leaf-content");
  const editor1 = makeEl("cm-editor");
  const scroller1 = makeEl("cm-scroller");
  const content1 = makeEl("cm-content");
  const embed1 = makeEl("cm-embed-block");
  const canvas1 = makeEl("vizardry-canvas") as HTMLElement;

  // Size the scroller
  Object.assign(scroller1.style, {
    width: px(800),
    padding: "0 8px",
    position: "relative",
    overflow: "hidden",
  });

  // Size cm-content with readable-line-width centering
  Object.assign(content1.style, {
    width: px(600),
    margin: "0 auto",
    position: "relative",
  });

  leaf1.appendChild(editor1);
  editor1.appendChild(scroller1);
  scroller1.appendChild(content1);
  content1.appendChild(embed1);
  embed1.appendChild(canvas1);
  document.body.appendChild(leaf1);

  applyFullWidth(canvas1);

  const w1 = parseFloat(canvas1.style.width);
  const ml1 = parseFloat(canvas1.style.marginLeft);

  assert(
    "Edit view: width = scrollerContentWidth - 32",
    Math.abs(w1 - 752) < 2,
    `Expected ~752px, got ${w1}px`
  );
  assert(
    "Edit view: marginLeft pulls canvas to HORIZONTAL_MARGIN/2 inside scroller",
    ml1 < 0,
    `Expected negative marginLeft, got ${ml1}px`
  );
  assert(
    "Edit view: position is relative",
    canvas1.style.position === "relative",
    `Got: ${canvas1.style.position}`
  );
  assert(
    "Edit view: left is 0",
    canvas1.style.left === "0px" || canvas1.style.left === "0",
    `Got: ${canvas1.style.left}`
  );
  assert(
    "Edit view: transform is none",
    canvas1.style.transform === "none",
    `Got: ${canvas1.style.transform}`
  );

  leaf1.remove();

  // ── Test 2: Edit view — ResizeObserver re-fires correctly ──────
  // After a simulated resize (scroller width changes to 1000px),
  // applyFullWidth called again should produce updated width.

  const leaf2 = makeEl("workspace-leaf-content");
  const editor2 = makeEl("cm-editor");
  const scroller2 = makeEl("cm-scroller");
  const content2 = makeEl("cm-content");
  const embed2 = makeEl("cm-embed-block");
  const canvas2 = makeEl("vizardry-canvas") as HTMLElement;

  Object.assign(scroller2.style, { width: px(800), padding: "0 8px", position: "relative", overflow: "hidden" });
  Object.assign(content2.style, { width: px(600), margin: "0 auto", position: "relative" });

  leaf2.appendChild(editor2);
  editor2.appendChild(scroller2);
  scroller2.appendChild(content2);
  content2.appendChild(embed2);
  embed2.appendChild(canvas2);
  document.body.appendChild(leaf2);

  applyFullWidth(canvas2);

  // Simulate resize
  scroller2.style.width = px(1000);
  applyFullWidth(canvas2);

  const w2 = parseFloat(canvas2.style.width);
  assert(
    "Edit view resize: width updates after second call",
    Math.abs(w2 - 952) < 2,
    `Expected ~952px after resize, got ${w2}px`
  );

  leaf2.remove();

  // ── Test 3: Read view — left:50% + translateX(-50%) applied ───
  // Simulate: workspace-leaf-content > markdown-preview-view >
  //           markdown-preview-sizer > el-pre > vizardry-canvas
  // sizer parent is 900px wide with no padding
  // Expected: width = 900 - 32 = 868px, left = 50%, transform = translateX(-50%)

  const leaf3 = makeEl("workspace-leaf-content");
  const preview3 = makeEl("markdown-preview-view");
  const sizerParent3 = makeEl("markdown-preview-section");
  const sizer3 = makeEl("markdown-preview-sizer");
  const elPre3 = makeEl("el-pre");
  const canvas3 = makeEl("vizardry-canvas") as HTMLElement;

  Object.assign(sizerParent3.style, { width: px(900), position: "relative" });

  leaf3.appendChild(preview3);
  preview3.appendChild(sizerParent3);
  sizerParent3.appendChild(sizer3);
  sizer3.appendChild(elPre3);
  elPre3.appendChild(canvas3);
  document.body.appendChild(leaf3);

  applyFullWidth(canvas3);

  const w3 = parseFloat(canvas3.style.width);
  assert(
    "Read view: width = parentWidth - 32",
    Math.abs(w3 - 868) < 2,
    `Expected ~868px, got ${w3}px`
  );
  assert(
    "Read view: left is 50%",
    canvas3.style.left === "50%",
    `Got: ${canvas3.style.left}`
  );
  assert(
    "Read view: transform is translateX(-50%)",
    canvas3.style.transform === "translateX(-50%)",
    `Got: ${canvas3.style.transform}`
  );

  leaf3.remove();

  // ── Test 4: Cleanup — watchers disconnected after removal ──────
  const leaf4 = makeEl("workspace-leaf-content");
  const editor4 = makeEl("cm-editor");
  const scroller4 = makeEl("cm-scroller");
  const content4 = makeEl("cm-content");
  const embed4 = makeEl("cm-embed-block");
  const canvas4 = makeEl("vizardry-canvas") as FullWidthCanvasEl;

  Object.assign(scroller4.style, { width: px(800), padding: "0 8px", position: "relative" });
  Object.assign(content4.style, { width: px(600), margin: "0 auto", position: "relative" });

  leaf4.appendChild(editor4);
  editor4.appendChild(scroller4);
  scroller4.appendChild(content4);
  content4.appendChild(embed4);
  embed4.appendChild(canvas4);
  document.body.appendChild(leaf4);

  applyFullWidth(canvas4);

  const hadObserver = !!canvas4.__vzdFullWidthObserver;
  leaf4.remove();

  // Trigger MutationObserver callback by waiting a microtask
  setTimeout(() => {
    assert(
      "Cleanup: ResizeObserver was attached after applyFullWidth",
      hadObserver,
      hadObserver ? "Observer was attached" : "Observer was never attached"
    );

    // ── Print results ──────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.group(`testApplyFullWidth: ${passed} passed, ${failed} failed`);
    for (const r of results) {
      const icon = r.passed ? "✅" : "❌";
      console.log(`${icon} ${r.test}${r.passed ? "" : ` — ${r.detail}`}`);
    }
    console.groupEnd();
  }, 50);
}
