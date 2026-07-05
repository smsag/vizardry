import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import type { StoryMap, StoryStep, StoryTask } from "../types";
import { initCanvas, renderHeadingLink } from "./controls";
import type { LinkResolver } from "../shared/links";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { enableDragGesture } from "../shared/drag-gesture";
import { t } from "../i18n";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import {
  addStoryTask,
  deleteStoryTask,
  moveStoryTaskSlice,
  moveStoryTaskCrossColumn,
  reorderStoryTask,
  renameStoryActivity,
  renameStoryStep,
  renameStoryTask,
  writeStoryMeta,
} from "../shared/story-edit";

const BACKLOG_SLICE = "__backlog__";

export function renderStoryMap(
  map: StoryMap,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const isEditMode = !!(app && ctx && source !== undefined)
    && app.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";
  const defaultTitle = "User Story Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  const doc = container.ownerDocument;
  const win = ownerWindow(container);

  // In edit mode always show the meta header so user/goal badges are clickable
  // even when both fields are currently empty.
  const showMeta = !!(map.user || map.goal) || isEditMode;

  initCanvas(container, "story", title, showMeta ? header => {
    const meta = header.createEl("div", { cls: "vzd-story-meta" });
    renderMetaBadge(meta, "user", t("story.label.user"), map.user, isEditMode, app, ctx, container);
    renderMetaBadge(meta, "goal", t("story.label.goal"), map.goal, isEditMode, app, ctx, container);
  } : undefined, source, onTitleEdit, app);

  const allSteps = map.activities.flatMap(a => a.steps);
  const totalCols = allSteps.length;
  if (totalCols === 0) return;

  const grid = container.createEl("div", { cls: "vzd-story-grid" });
  grid.style.setProperty("--vzd-story-cols", String(totalCols));

  // ── Shared inline-edit helper ─────────────────────────────────────────────
  function activateInlineEdit(
    el: HTMLElement,
    currentValue: string,
    onCommit: (newValue: string) => void,
  ): void {
    if (el.classList.contains("vzd-editing")) return;
    el.classList.add("vzd-editing");
    el.textContent = "";
    const input = el.createEl("input", { cls: "vzd-inline-input", type: "text" });
    input.value = currentValue;
    input.focus({ preventScroll: true });
    input.select();
    let committed = false;
    const commit = (): void => {
      if (committed) return;
      committed = true;
      el.classList.remove("vzd-editing");
      const v = input.value.trim();
      if (v && v !== currentValue) {
        onCommit(v);
        // The writeback triggers a re-render; optimistically restore text in
        // case re-render is slightly delayed.
        el.textContent = v;
      } else {
        el.textContent = currentValue;
      }
    };
    const cancel = (): void => {
      if (committed) return;
      committed = true;
      el.classList.remove("vzd-editing");
      el.textContent = currentValue;
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
  }

  // ── Activity headers ──────────────────────────────────────────────────────
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

    if (isEditMode && app && ctx) {
      el.classList.add("vzd-story-activity-header--editable");
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        activateInlineEdit(el, activity.name, (newName) => {
          renameStoryActivity(app, ctx, container, activity.name, newName);
        });
      });
    }
  }

  // ── Step headers ──────────────────────────────────────────────────────────
  const stepHeaderEls: HTMLElement[] = [];
  for (let i = 0; i < allSteps.length; i++) {
    const step = allSteps[i];
    const el = grid.createEl("div", { cls: "vzd-story-step-header", text: step.name });
    el.dataset.stepCol = String(i);
    stepHeaderEls.push(el);

    if (isEditMode && app && ctx) {
      el.classList.add("vzd-story-step-header--editable");
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        activateInlineEdit(el, step.name, (newName) => {
          renameStoryStep(app, ctx, container, step.name, newName);
        });
      });
    }
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
    fromSlice: string | null;
    fromIndex: number;
    ghost: HTMLElement;
    placeholder: HTMLElement;
    toStepName: string;
    toSlice: string | null;
    toIndex: number;
    overGrid: boolean;
  };
  let drag: DragState | null = null;

  function endDrag(): void {
    if (!drag) return;
    const { card, taskName, stepName, fromSlice, fromIndex, ghost, placeholder } = drag;
    const { toStepName, toSlice, toIndex, overGrid } = drag;
    drag = null;

    ghost.remove();
    placeholder.remove();
    card.classList.remove("vzd-story-task-card--hidden");

    if (!app || !ctx || !overGrid) return;

    // Preserve scroll position — editor.replaceRange() moves the CM6 cursor
    // to the edited line which causes Obsidian to scroll there.
    const savedScrollY = win.scrollY;
    const savedScrollX = win.scrollX;

    if (toStepName !== stepName) {
      moveStoryTaskCrossColumn(app, ctx, container, taskName, stepName, toStepName, toSlice);
    } else if (toSlice !== fromSlice) {
      moveStoryTaskSlice(app, ctx, container, taskName, stepName, fromSlice, toSlice);
    } else if (toIndex !== fromIndex) {
      reorderStoryTask(app, ctx, container, stepName, fromSlice, fromIndex, toIndex);
    }

    win.requestAnimationFrame(() => win.scrollTo(savedScrollX, savedScrollY));
  }

  function findDropTarget(clientX: number, clientY: number): { cell: HTMLElement; sliceName: string | null; stepName: string; index: number } | null {
    const els = doc.elementsFromPoint(clientX, clientY);
    const cell = els.find(e => e.classList.contains("vzd-story-cell")) as HTMLElement | undefined;
    if (!cell) return null;

    let band: HTMLElement | null = cell;
    while (band && !band.classList.contains("vzd-story-slice-band")) {
      band = band.parentElement;
    }
    const sliceName = (band?.dataset.sliceName === BACKLOG_SLICE ? null : band?.dataset.sliceName) ?? null;
    const stepName = cell.dataset.stepName ?? "";

    const cards = Array.from(cell.querySelectorAll<HTMLElement>(
      ".vzd-story-task-card:not(.vzd-story-task-card--ghost):not(.vzd-story-task-card--placeholder):not(.vzd-story-task-card--hidden)"
    ));
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { index = i; break; }
    }

    return { cell, sliceName, stepName, index };
  }

  function updateDragPosition(clientX: number, clientY: number): void {
    if (!drag) return;
    drag.ghost.style.left = `${clientX + 8}px`;
    drag.ghost.style.top = `${clientY + 8}px`;

    const target = findDropTarget(clientX, clientY);
    if (!target) {
      drag.overGrid = false;
      return;
    }

    drag.overGrid = true;
    drag.toStepName = target.stepName;
    drag.toSlice = target.sliceName;
    drag.toIndex = target.index;

    // Remove placeholder from its current position before re-inserting so
    // there's never more than one placeholder in the DOM at once.
    drag.placeholder.remove();

    const cards = Array.from(target.cell.querySelectorAll<HTMLElement>(
      ".vzd-story-task-card:not(.vzd-story-task-card--ghost):not(.vzd-story-task-card--placeholder):not(.vzd-story-task-card--hidden)"
    ));
    if (target.index >= cards.length) {
      target.cell.appendChild(drag.placeholder);
    } else {
      target.cell.insertBefore(drag.placeholder, cards[target.index]);
    }
  }

  function startDrag(card: HTMLElement, clientX: number, clientY: number): void {
    if (!isEditMode || !app || !ctx) return;

    const taskName = card.dataset.taskName ?? "";
    const stepName = card.dataset.stepName ?? "";
    const fromSlice = card.dataset.sliceName === BACKLOG_SLICE ? null : (card.dataset.sliceName ?? null);
    const fromIndex = parseInt(card.dataset.taskIndex ?? "0", 10);

    const rect = card.getBoundingClientRect();
    const ghost = doc.body.createEl("div", { cls: "vzd-story-task-card vzd-story-task-card--ghost" });
    ghost.style.width = `${rect.width}px`;
    ghost.innerHTML = card.innerHTML;
    ghost.style.left = `${clientX + 8}px`;
    ghost.style.top = `${clientY + 8}px`;

    const placeholder = card.parentElement!.createEl("div", { cls: "vzd-story-task-card vzd-story-task-card--placeholder" });
    placeholder.style.height = `${rect.height}px`;
    card.parentElement!.insertBefore(placeholder, card);
    card.classList.add("vzd-story-task-card--hidden");

    drag = {
      card, taskName, stepName, fromSlice, fromIndex,
      ghost, placeholder,
      toStepName: stepName, toSlice: fromSlice, toIndex: fromIndex,
      overGrid: false,
    };
  }

  // ── Task card rendering ───────────────────────────────────────────────────
  function renderTaskCard(cell: HTMLElement, task: StoryTask, sliceName: string | null, index: number): void {
    const card = cell.createEl("div", { cls: "vzd-story-task-card" });
    const nameDiv = card.createEl("div", { cls: "vzd-story-task-name", text: task.name });
    if (task.subtitle) {
      card.createEl("div", { cls: "vzd-story-task-subtitle", text: task.subtitle });
    }
    renderHeadingLink(card, task.name, resolver, navigateTo, app, ctx?.sourcePath);
    if (isEditMode && app && ctx) {
      card.dataset.taskName = task.name;
      card.dataset.stepName = cell.dataset.stepName ?? "";
      card.dataset.sliceName = sliceName ?? BACKLOG_SLICE;
      card.dataset.taskIndex = String(index);
      card.classList.add("vzd-story-task-card--draggable");

      // Double-click on name to rename
      nameDiv.classList.add("vzd-story-task-name--editable");
      nameDiv.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        activateInlineEdit(nameDiv, task.name, (newName) => {
          renameStoryTask(app, ctx, container, task.name, newName);
        });
      });

      // × delete button
      const delBtn = card.createEl("button", {
        cls: "vzd-story-task-delete vzd-btn",
        attr: { "aria-label": t("story.deleteTask") },
      });
      delBtn.textContent = "×";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        deleteStoryTask(app, ctx, container, task.name);
      });

      // Drag to move — only initiates after deliberate movement, so a plain
      // click, double-click, or tap never triggers the drag machinery.
      enableDragGesture(card, {
        // Skip while an inline-edit input is open, and let interactive children
        // (link/delete buttons, anchors) handle their own tap.
        shouldStart: (target) => !card.querySelector(".vzd-inline-input") && !target.closest("button, a"),
        onStart: (x, y) => startDrag(card, x, y),
        onMove: (x, y) => updateDragPosition(x, y),
        onEnd: () => endDrag(),
      });
    }
  }

  function appendCards(cell: HTMLElement, step: StoryStep, taskKeys: string[], sliceName: string | null): void {
    for (let i = 0; i < taskKeys.length; i++) {
      const task = step.tasks.find(t => t.name.toLowerCase().trim() === taskKeys[i]);
      if (task) renderTaskCard(cell, task, sliceName, i);
    }
  }

  // ── Slice bands ───────────────────────────────────────────────────────────
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
      if (taskKeys.length === 0) cell.addClass("vzd-story-cell-empty");
      else appendCards(cell, step, taskKeys, slice.name);
      cellsByStep[i].push(cell);
    }
  }

  // ── Backlog band ──────────────────────────────────────────────────────────
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
      if (tasks.length === 0 && !isEditMode) cell.addClass("vzd-story-cell-empty");
      else {
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

// ── Meta badge (user / goal) ──────────────────────────────────────────────

function renderMetaBadge(
  parent: HTMLElement,
  key: "user" | "goal",
  label: string,
  value: string,
  isEditMode: boolean,
  app: App | undefined,
  ctx: MarkdownPostProcessorContext | undefined,
  container: HTMLElement,
): void {
  // Always render in edit mode; in read mode skip empty fields.
  if (!value && !isEditMode) return;

  const displayText = value ? `${label}: ${value}` : `${label}: —`;
  const span = parent.createEl("span", {
    cls: "vzd-story-meta-item" + (isEditMode ? " vzd-story-meta-item--editable" : ""),
    text: displayText,
  });

  if (!isEditMode || !app || !ctx) return;

  span.addEventListener("click", (e) => {
    e.stopPropagation();
    if (span.classList.contains("vzd-editing")) return;
    span.classList.add("vzd-editing");
    span.textContent = "";
    const input = span.createEl("input", { cls: "vzd-inline-input", type: "text" });
    input.value = value;
    input.focus({ preventScroll: true });
    input.select();
    let committed = false;
    const commit = (): void => {
      if (committed) return;
      committed = true;
      span.classList.remove("vzd-editing");
      const v = input.value.trim();
      writeStoryMeta(app, ctx, container, key, v);
      span.textContent = v ? `${label}: ${v}` : `${label}: —`;
    };
    const cancel = (): void => {
      if (committed) return;
      committed = true;
      span.classList.remove("vzd-editing");
      span.textContent = displayText;
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
    });
  });
}

// ── Carousel (unchanged) ──────────────────────────────────────────────────

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
  const mq = ownerWindow(container).matchMedia("(max-width: 600px)");

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
