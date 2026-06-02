import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { StoryMap, StoryStep, StoryTask } from "../types";
import { initCanvas } from "./controls";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected } from "../shared/lifecycle";
import { t } from "../i18n";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { addStoryTask, moveStoryTaskSlice, reorderStoryTask } from "../shared/story-edit";

const BACKLOG_SLICE = "__backlog__";

export function renderStoryMap(
  map: StoryMap,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const isEditMode = !!(app && ctx && source !== undefined);
  const defaultTitle = "User Story Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "story", title, map.user || map.goal ? header => {
    const meta = header.createEl("div", { cls: "vzd-story-meta" });
    if (map.user) meta.createEl("span", { cls: "vzd-story-meta-item", text: `${t("story.label.user")}: ${map.user}` });
    if (map.goal) meta.createEl("span", { cls: "vzd-story-meta-item", text: `${t("story.label.goal")}: ${map.goal}` });
  } : undefined, source, onTitleEdit);

  const allSteps = map.activities.flatMap(a => a.steps);
  const totalCols = allSteps.length;
  if (totalCols === 0) return;

  const grid = container.createEl("div", { cls: "vzd-story-grid" });
  grid.style.setProperty("--vzd-story-cols", String(totalCols));

  type ActivityHeaderRef = { el: HTMLElement; start: number; end: number; origGridCol: string };
  const activityHeaderRefs: ActivityHeaderRef[] = [];
  let colOffset = 1;
  let stepOffset = 0;
  for (const activity of map.activities) {
    const origGridCol = `${colOffset} / span ${activity.steps.length}`;
    const el = grid.createEl("div", { cls: "vzd-story-activity-header", text: activity.name });
    el.style.gridColumn = origGridCol;
    el.dataset.origGridCol = origGridCol;
    activityHeaderRefs.push({ el, start: stepOffset, end: stepOffset + activity.steps.length - 1, origGridCol });
    colOffset += activity.steps.length;
    stepOffset += activity.steps.length;
  }

  const stepHeaderEls: HTMLElement[] = [];
  for (let i = 0; i < allSteps.length; i++) {
    const el = grid.createEl("div", { cls: "vzd-story-step-header", text: allSteps[i].name });
    el.dataset.stepCol = String(i);
    stepHeaderEls.push(el);
  }

  const assignedKeys = new Set<string>();
  for (const slice of map.slices) {
    for (const [stepKey, taskKeys] of Object.entries(slice.cells)) {
      for (const taskKey of taskKeys) {
        assignedKeys.add(`${stepKey}\0${taskKey}`);
      }
    }
  }

  // ── Drag-to-move state ────────────────────────────────────────────────────
  type DragState = {
    card: HTMLElement;
    taskName: string;
    stepName: string;
    fromSlice: string | null;  // null = backlog
    fromIndex: number;
    ghost: HTMLElement;
    placeholder: HTMLElement;
    toSlice: string | null;
    toIndex: number;
  };
  let drag: DragState | null = null;

  function endDrag(): void {
    if (!drag) return;
    const { card, taskName, stepName, fromSlice, fromIndex, ghost, placeholder, toSlice, toIndex } = drag;
    drag = null;

    ghost.remove();
    placeholder.remove();
    card.classList.remove("vzd-story-task-card--hidden");

    document.removeEventListener("mousemove", onDocMouseMove);
    document.removeEventListener("mouseup", onDocMouseUp);

    if (!app || !ctx) return;

    if (toSlice !== fromSlice) {
      moveStoryTaskSlice(app, ctx, container, taskName, stepName, fromSlice, toSlice);
    } else if (toIndex !== fromIndex) {
      reorderStoryTask(app, ctx, container, stepName, fromSlice, fromIndex, toIndex);
    }
  }

  function findDropTarget(clientX: number, clientY: number): { cell: HTMLElement; sliceName: string | null; index: number } | null {
    // Find the topmost vzd-story-cell under the pointer
    const els = document.elementsFromPoint(clientX, clientY);
    const cell = els.find(e => e.classList.contains("vzd-story-cell")) as HTMLElement | undefined;
    if (!cell) return null;

    // Identify the slice band containing this cell
    let band: HTMLElement | null = cell;
    while (band && !band.classList.contains("vzd-story-slice-band")) {
      band = band.parentElement;
    }
    const sliceName = band?.dataset.sliceName ?? null;

    // Find where among the existing cards the pointer falls
    const cards = Array.from(cell.querySelectorAll<HTMLElement>(
      ".vzd-story-task-card:not(.vzd-story-task-card--ghost):not(.vzd-story-task-card--placeholder):not(.vzd-story-task-card--hidden)"
    ));
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }

    return { cell, sliceName, index };
  }

  function onDocMouseMove(e: MouseEvent): void {
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX + 8}px`;
    drag.ghost.style.top = `${e.clientY + 8}px`;

    const target = findDropTarget(e.clientX, e.clientY);
    if (!target) return;

    // Only allow drops within the same step column
    if (target.cell.dataset.stepCol !== String(allSteps.findIndex(s => s.name === drag!.stepName))) return;

    drag.toSlice = target.sliceName;
    drag.toIndex = target.index;

    // Move placeholder into position
    const cards = Array.from(target.cell.querySelectorAll<HTMLElement>(
      ".vzd-story-task-card:not(.vzd-story-task-card--ghost):not(.vzd-story-task-card--hidden)"
    ));
    if (target.index >= cards.length) {
      target.cell.appendChild(drag.placeholder);
    } else {
      target.cell.insertBefore(drag.placeholder, cards[target.index]);
    }
  }

  const onDocMouseUp = (): void => endDrag();

  function startDrag(card: HTMLElement, e: MouseEvent | Touch): void {
    if (!isEditMode || !app || !ctx) return;

    const taskName = card.dataset.taskName ?? "";
    const stepName = card.dataset.stepName ?? "";
    const fromSlice = card.dataset.sliceName === BACKLOG_SLICE ? null : (card.dataset.sliceName ?? null);
    const fromIndex = parseInt(card.dataset.taskIndex ?? "0", 10);

    const rect = card.getBoundingClientRect();
    const ghost = document.body.createEl("div", { cls: "vzd-story-task-card vzd-story-task-card--ghost" });
    ghost.style.width = `${rect.width}px`;
    ghost.innerHTML = card.innerHTML;
    ghost.style.left = `${e.clientX + 8}px`;
    ghost.style.top = `${e.clientY + 8}px`;

    const placeholder = card.parentElement!.createEl("div", { cls: "vzd-story-task-card vzd-story-task-card--placeholder" });
    placeholder.style.height = `${rect.height}px`;
    card.parentElement!.insertBefore(placeholder, card);

    card.classList.add("vzd-story-task-card--hidden");

    drag = { card, taskName, stepName, fromSlice, fromIndex, ghost, placeholder, toSlice: fromSlice, toIndex: fromIndex };

    document.addEventListener("mousemove", onDocMouseMove);
    document.addEventListener("mouseup", onDocMouseUp);
  }

  function renderTaskCard(cell: HTMLElement, task: StoryTask, sliceName: string | null, index: number): void {
    const card = cell.createEl("div", { cls: "vzd-story-task-card" });
    card.createEl("div", { cls: "vzd-story-task-name", text: task.name });
    if (task.subtitle) {
      card.createEl("div", { cls: "vzd-story-task-subtitle", text: task.subtitle });
    }
    if (isEditMode) {
      card.dataset.taskName = task.name;
      card.dataset.stepName = cell.dataset.stepName ?? "";
      card.dataset.sliceName = sliceName ?? BACKLOG_SLICE;
      card.dataset.taskIndex = String(index);
      card.classList.add("vzd-story-task-card--draggable");
      card.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDrag(card, e);
      });
      card.addEventListener("touchstart", (e) => {
        e.preventDefault();
        startDrag(card, e.touches[0]);
        const onTouchMove = (ev: TouchEvent): void => {
          if (!drag) return;
          ev.preventDefault();
          drag.ghost.style.left = `${ev.touches[0].clientX + 8}px`;
          drag.ghost.style.top = `${ev.touches[0].clientY + 8}px`;
          const target = findDropTarget(ev.touches[0].clientX, ev.touches[0].clientY);
          if (!target) return;
          if (target.cell.dataset.stepCol !== (card.closest(".vzd-story-cell") as HTMLElement | null)?.dataset.stepCol) return;
          drag.toSlice = target.sliceName;
          drag.toIndex = target.index;
          const cards = Array.from(target.cell.querySelectorAll<HTMLElement>(
            ".vzd-story-task-card:not(.vzd-story-task-card--ghost):not(.vzd-story-task-card--hidden)"
          ));
          if (target.index >= cards.length) {
            target.cell.appendChild(drag.placeholder);
          } else {
            target.cell.insertBefore(drag.placeholder, cards[target.index]);
          }
        };
        const onTouchEnd = (): void => {
          endDrag();
          document.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("touchend", onTouchEnd);
        };
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
      }, { passive: false });
    }
  }

  function appendCards(cell: HTMLElement, step: StoryStep, taskKeys: string[], sliceName: string | null): void {
    for (let i = 0; i < taskKeys.length; i++) {
      const task = step.tasks.find(t => t.name.toLowerCase().trim() === taskKeys[i]);
      if (task) renderTaskCard(cell, task, sliceName, i);
    }
  }

  const cellsByStep: HTMLElement[][] = Array.from({ length: totalCols }, () => []);

  for (const slice of map.slices) {
    const band = grid.createEl("div", { cls: "vzd-story-slice-band" });
    band.dataset.sliceName = slice.name;
    band.createEl("div", { cls: "vzd-story-slice-label", text: slice.name });
    const cellsRow = band.createEl("div", { cls: "vzd-story-slice-cells" });
    cellsRow.style.setProperty("--vzd-story-cols", String(totalCols));

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      const stepKey = step.name.toLowerCase().trim();
      const taskKeys = slice.cells[stepKey] ?? [];
      const cell = cellsRow.createEl("div", { cls: "vzd-story-cell" });
      cell.dataset.stepCol = String(i);
      cell.dataset.stepName = step.name;
      if (taskKeys.length === 0) {
        cell.addClass("vzd-story-cell-empty");
      } else {
        appendCards(cell, step, taskKeys, slice.name);
      }
      cellsByStep[i].push(cell);
    }
  }

  const backlogByStep = new Map<string, typeof allSteps[number]["tasks"]>();
  for (const step of allSteps) {
    const stepKey = step.name.toLowerCase().trim();
    const unassigned = step.tasks.filter(
      t => !assignedKeys.has(`${stepKey}\0${t.name.toLowerCase().trim()}`)
    );
    if (unassigned.length > 0 || isEditMode) backlogByStep.set(stepKey, unassigned);
  }

  if (backlogByStep.size > 0) {
    const backlogBand = grid.createEl("div", { cls: "vzd-story-slice-band vzd-story-backlog-band" });
    backlogBand.dataset.sliceName = BACKLOG_SLICE;
    backlogBand.createEl("div", { cls: "vzd-story-slice-label vzd-story-backlog-label", text: t("story.backlog") });
    const backlogCellsRow = backlogBand.createEl("div", { cls: "vzd-story-slice-cells" });
    backlogCellsRow.style.setProperty("--vzd-story-cols", String(totalCols));

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      const stepKey = step.name.toLowerCase().trim();
      const tasks = backlogByStep.get(stepKey) ?? [];
      const cell = backlogCellsRow.createEl("div", { cls: "vzd-story-cell" });
      cell.dataset.stepCol = String(i);
      cell.dataset.stepName = step.name;
      if (tasks.length === 0 && !isEditMode) {
        cell.addClass("vzd-story-cell-empty");
      } else {
        for (let j = 0; j < tasks.length; j++) renderTaskCard(cell, tasks[j], null, j);
      }
      if (isEditMode) {
        const btn = cell.createEl("button", { cls: "vzd-story-add-task vzd-btn" });
        setIcon(btn, "plus");
        btn.setAttribute("aria-label", t("story.addTask"));
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          addStoryTask(app!, ctx!, container, step.name, t("story.newTask"));
        });
      }
      cellsByStep[i].push(cell);
    }
  }

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

  // All inner cell-row grids (one per slice band, including backlog)
  const sliceCellsEls = Array.from(
    grid.querySelectorAll(".vzd-story-slice-cells")
  ) as HTMLElement[];

  const nav = container.createEl("div", { cls: "vzd-story-nav" });
  const prevBtn = nav.createEl("button", { cls: "vzd-story-nav-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(prevBtn, "chevron-left");
  prevBtn.setAttribute("aria-label", t("nav.previousStep"));
  const label = nav.createEl("span", { cls: "vzd-story-nav-label" });
  const nextBtn = nav.createEl("button", { cls: "vzd-story-nav-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(nextBtn, "chevron-right");
  nextBtn.setAttribute("aria-label", t("nav.nextStep"));

  function applyMobile(col: number): void {
    grid.style.gridTemplateColumns = "1fr";
    // Collapse each slice's inner grid to a single column
    sliceCellsEls.forEach(el => { el.style.gridTemplateColumns = "1fr"; });

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
    sliceCellsEls.forEach(el => { el.style.gridTemplateColumns = ""; });
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

  // Remove the mq listener when the grid is detached from the DOM.
  // Without this, each re-render of the note accumulates a new listener on the
  // global MediaQueryList object, leaking the closure (and its DOM references).
  onDisconnected(grid, () => {
    mq.removeEventListener("change", onMediaChange as (e: MediaQueryListEvent) => void);
  });

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  let touchStartX = 0;
  grid.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  grid.addEventListener("touchend", (e) => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) goTo(delta > 0 ? current + 1 : current - 1);
  }, { passive: true });
}
