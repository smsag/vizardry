import { Menu, Notice, setIcon } from "obsidian";
import { createAddControl } from "./add-control";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { JourneyCard, JourneyData, JourneyLaneKey, JourneyPhase } from "../types";
import { initCanvas, renderHeadingLink, renderCanvasWarnings } from "./controls";
import type { RenderContext } from "./render-context";
import { SWIPE_THRESHOLD_PX } from "../shared/constants";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { enableDragGesture, preserveScroll } from "../shared/drag-gesture";
import { activateInlineEdit } from "./inline-edit";
import { t } from "../i18n";
import { attachItemMenu } from "../shared/item-menu";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { JOURNEY_DIVIDERS, MOOD_MAX, MOOD_MIN, lanesForVariant } from "../journey";
import { createSvgEl } from "../shared/svg";
import { isEditModeActive } from "../shared/editor";
import { textOnlyClone } from "./card-block";
import { createInlineEl, setInline, stripInline } from "../shared/inline-markdown";
import {
  addJourneyCard,
  deleteJourneyCard,
  moveJourneyCardCrossPhase,
  renameJourneyCard,
  renamePhase,
  reorderJourneyCard,
  writeJourneyMeta,
  writeJourneyMood,
} from "../shared/journey-edit";

export function renderJourneyMap(
  data: JourneyData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { source, app, ctx, resolver, navigateTo } = rc;
  const isEditMode = !!(app && ctx && source !== undefined)
    && isEditModeActive(app);
  const defaultTitle = data.variant === "blueprint" ? "Service Blueprint" : "Customer Journey Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = isEditMode
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  const doc = container.ownerDocument;
  const win = ownerWindow(container);

  const showMeta = !!(data.persona || data.scenario) || isEditMode;

  initCanvas(container, "journey", title, header => {
    if (showMeta) {
      const meta = header.createEl("div", { cls: "vzd-journey-meta" });
      renderMetaBadge(meta, "persona", t("journey.label.persona"), data.persona, isEditMode, app, ctx, container);
      renderMetaBadge(meta, "scenario", t("journey.label.scenario"), data.scenario, isEditMode, app, ctx, container);
    }
  }, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  const phases = data.phases;
  const totalCols = phases.length;
  if (totalCols === 0) return;

  const lanes = lanesForVariant(data.variant);

  const grid = container.createEl("div", { cls: "vzd-journey-grid" });
  grid.style.setProperty("--vzd-journey-cols", String(totalCols));

  // ── Phase headers ────────────────────────────────────────────────────────
  const phaseHeaderEls: HTMLElement[] = [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const el = createInlineEl(grid, "div", "vzd-journey-phase-header", phase.name);
    el.dataset.phaseCol = String(i);
    phaseHeaderEls.push(el);

    if (isEditMode && app && ctx) {
      el.classList.add("vzd-journey-phase-header--editable");
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        activateInlineEdit(el, phase.name, (newName) => {
          renamePhase(app, ctx, container, phase.name, newName);
        });
      });
    }
  }

  // ── Drag-to-move state ───────────────────────────────────────────────────
  type DragState = {
    card: HTMLElement;
    cardIndex: number;
    laneKey: JourneyLaneKey;
    fromPhase: string;
    ghost: HTMLElement;
    placeholder: HTMLElement;
    toPhase: string;
    toIndex: number;
    overGrid: boolean;
  };
  let drag: DragState | null = null;

  function endDrag(): void {
    if (!drag) return;
    const { card, cardIndex, laneKey, fromPhase, ghost, placeholder } = drag;
    const { toPhase, toIndex, overGrid } = drag;
    drag = null;

    ghost.remove();
    placeholder.remove();
    card.classList.remove("vzd-journey-card--hidden");

    if (!app || !ctx || !overGrid) return;

    preserveScroll(win, () => {
      if (toPhase !== fromPhase) {
        moveJourneyCardCrossPhase(app, ctx, container, cardIndex, fromPhase, toPhase, laneKey);
      } else if (toIndex !== cardIndex) {
        reorderJourneyCard(app, ctx, container, fromPhase, laneKey, cardIndex, toIndex);
      }
    });
  }

  function findDropTarget(clientX: number, clientY: number, laneKey: JourneyLaneKey): { cell: HTMLElement; phaseName: string; index: number } | null {
    const els = doc.elementsFromPoint(clientX, clientY);
    const cell = els.find(e => e.classList.contains("vzd-journey-cell")) as HTMLElement | undefined;
    if (!cell) return null;

    let row: HTMLElement | null = cell;
    while (row && !row.classList.contains("vzd-journey-lane-row")) {
      row = row.parentElement;
    }
    if (row?.dataset.laneKey !== laneKey) return null;

    const phaseName = cell.dataset.phaseName ?? "";

    const cards = Array.from(cell.querySelectorAll<HTMLElement>(
      ".vzd-journey-card:not(.vzd-journey-card--ghost):not(.vzd-journey-card--placeholder):not(.vzd-journey-card--hidden)"
    ));
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { index = i; break; }
    }

    return { cell, phaseName, index };
  }

  function updateDragPosition(clientX: number, clientY: number): void {
    if (!drag) return;
    drag.ghost.style.left = `${clientX + 8}px`;
    drag.ghost.style.top = `${clientY + 8}px`;

    const target = findDropTarget(clientX, clientY, drag.laneKey);
    if (!target) {
      drag.overGrid = false;
      return;
    }

    drag.overGrid = true;
    drag.toPhase = target.phaseName;
    drag.toIndex = target.index;

    drag.placeholder.remove();

    const cards = Array.from(target.cell.querySelectorAll<HTMLElement>(
      ".vzd-journey-card:not(.vzd-journey-card--ghost):not(.vzd-journey-card--placeholder):not(.vzd-journey-card--hidden)"
    ));
    if (target.index >= cards.length) {
      target.cell.appendChild(drag.placeholder);
    } else {
      target.cell.insertBefore(drag.placeholder, cards[target.index]);
    }
  }

  function startDrag(card: HTMLElement, clientX: number, clientY: number): void {
    if (!isEditMode || !app || !ctx) return;

    const laneKey = card.dataset.laneKey as JourneyLaneKey;
    const fromPhase = card.dataset.phaseName ?? "";
    const cardIndex = parseInt(card.dataset.cardIndex ?? "0", 10);

    const rect = card.getBoundingClientRect();
    const ghost = doc.body.createEl("div", { cls: "vzd-journey-card vzd-journey-card--ghost" });
    ghost.style.width = `${rect.width}px`;
    // Text only: a clone with the card's buttons and data-vzd-id markers made
    // the ghost a second target for id lookups mid-drag.
    ghost.appendChild(textOnlyClone(card));
    ghost.style.left = `${clientX + 8}px`;
    ghost.style.top = `${clientY + 8}px`;

    const placeholder = card.parentElement!.createEl("div", { cls: "vzd-journey-card vzd-journey-card--placeholder" });
    placeholder.style.height = `${rect.height}px`;
    card.parentElement!.insertBefore(placeholder, card);
    card.classList.add("vzd-journey-card--hidden");

    drag = {
      card, cardIndex, laneKey, fromPhase,
      ghost, placeholder,
      toPhase: fromPhase, toIndex: cardIndex,
      overGrid: false,
    };
  }

  onDisconnected(grid, () => {
    drag?.ghost.remove();
    drag?.placeholder.remove();
    drag = null;
  });

  // ── Card rendering ───────────────────────────────────────────────────────
  function renderJourneyCardEl(cell: HTMLElement, card: JourneyCard, phaseName: string, laneKey: JourneyLaneKey, index: number): void {
    const cardEl = cell.createEl("div", { cls: "vzd-journey-card" });
    const nameDiv = createInlineEl(cardEl, "div", "vzd-journey-card-name", card.name);
    if (card.subtitle) {
      createInlineEl(cardEl, "div", "vzd-journey-card-subtitle", card.subtitle);
    }
    renderHeadingLink(cardEl, card.name, resolver, navigateTo, app, ctx?.sourcePath);

    if (isEditMode && app && ctx) {
      cardEl.dataset.phaseName = phaseName;
      cardEl.dataset.laneKey = laneKey;
      cardEl.dataset.cardIndex = String(index);
      cardEl.classList.add("vzd-journey-card--draggable");

      nameDiv.classList.add("vzd-journey-card-name--editable");
      nameDiv.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        activateInlineEdit(nameDiv, card.name, (newName) => {
          renameJourneyCard(app, ctx, container, phaseName, laneKey, index, newName);
        });
      });

      attachItemMenu(cardEl, {
        label: t("menu.actionsFor", { name: stripInline(card.name) }),
        button: { parent: cardEl, cls: "vzd-journey-card-delete" },
        actions: () => [{
          title: t("journey.deleteCard"),
          icon: "trash-2",
          destructive: true,
          onChoose: () => deleteJourneyCard(app, ctx, container, phaseName, laneKey, index),
        }],
      });

      enableDragGesture(cardEl, {
        shouldStart: (target) => !cardEl.querySelector(".vzd-editing") && !target.closest("button, a"),
        onStart: (x, y) => startDrag(cardEl, x, y),
        onMove: (x, y) => updateDragPosition(x, y),
        onEnd: () => endDrag(),
      });
    }
  }

  // ── Lane rows ────────────────────────────────────────────────────────────
  const cellsByPhase: HTMLElement[][] = Array.from({ length: totalCols }, () => []);

  // The emotion curve sits right above Thoughts & Feelings, the lane it
  // summarises. Shown once any phase has a mood, and always while editing
  // so the first one can be set.
  const showMood = phases.some(p => p.mood !== undefined) || isEditMode;

  for (const lane of lanes) {
    if (lane.key === "feeling" && showMood) {
      const moodCells = renderMoodRow(grid, phases, isEditMode && app && ctx
        ? (phaseName, mood) => {
          if (!writeJourneyMood(app, ctx, container, phaseName, mood)) new Notice(t("edit.writeFailed"));
        }
        : null);
      moodCells.forEach((cell, i) => cellsByPhase[i].push(cell));
    }
    const dividerLabel = JOURNEY_DIVIDERS[lane.key];
    if (dividerLabel) {
      const divider = grid.createEl("div", { cls: "vzd-journey-divider-row" });
      divider.createEl("span", { cls: "vzd-journey-divider-label", text: dividerLabel });
    }

    const row = grid.createEl("div", { cls: "vzd-journey-lane-row" });
    row.dataset.laneKey = lane.key;
    row.createEl("div", { cls: "vzd-journey-lane-label", text: lane.label });
    const cellsRow = row.createEl("div", { cls: "vzd-journey-lane-cells" });
    cellsRow.style.setProperty("--vzd-journey-cols", String(totalCols));

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const cards = phase.lanes[lane.key] ?? [];
      const cell = cellsRow.createEl("div", { cls: "vzd-journey-cell" });
      cell.dataset.phaseCol = String(i);
      cell.dataset.phaseName = phase.name;
      cell.dataset.laneKey = lane.key;

      for (let j = 0; j < cards.length; j++) renderJourneyCardEl(cell, cards[j], phase.name, lane.key, j);

      if (isEditMode && app && ctx) {
        createAddControl(cell, {
          label: t("journey.addCard"),
          alwaysVisible: cards.length === 0,
          onAdd: () => addJourneyCard(app, ctx, container, phase.name, lane.key, t("journey.newCard")),
        });
      } else if (cards.length === 0) {
        cell.addClass("vzd-journey-cell-empty");
      }

      cellsByPhase[i].push(cell);
    }
  }

  setupJourneyCarousel(container, grid, phases.map(p => p.name), phaseHeaderEls, cellsByPhase);
}

// ── Emotion curve ──────────────────────────────────────────────────────────
//
// One cell per phase, like every other lane, so the phone carousel can show
// a phase at a time. Each cell draws its own piece of the curve: a point at
// its centre and, toward each neighbour that has a mood, a half-segment
// ending midway between the two. The SVG overhangs the cell by half the
// column gap on each side, so neighbouring pieces meet in the gap and read
// as one continuous line. Every piece is flat where it meets the next, so
// the joins are smooth without any cell knowing the whole curve. The
// positive/negative zones and the neutral line are one background on the
// lane (styles.css), so they have no seams at the gaps.

/** Vertical position (0 top … 100 bottom) of a mood on the curve. */
const moodY = (mood: number): number => 50 - (mood / MOOD_MAX) * 38;

const moodTone = (mood: number): string => mood > 0 ? "positive" : mood < 0 ? "negative" : "neutral";

const formatMood = (mood: number): string => mood > 0 ? `+${mood}` : mood < 0 ? `\u2212${-mood}` : "0";

function renderMoodRow(
  grid: HTMLElement,
  phases: JourneyPhase[],
  onSet: ((phaseName: string, mood: number | null) => void) | null,
): HTMLElement[] {
  const row = grid.createEl("div", { cls: "vzd-journey-lane-row vzd-journey-mood-row" });
  row.dataset.laneKey = "mood";
  row.createEl("div", { cls: "vzd-journey-lane-label", text: t("journey.lane.mood") });
  const cellsRow = row.createEl("div", { cls: "vzd-journey-lane-cells" });
  cellsRow.style.setProperty("--vzd-journey-cols", String(phases.length));

  const cells: HTMLElement[] = [];
  phases.forEach((phase, i) => {
    const cell = cellsRow.createEl("div", { cls: "vzd-journey-mood-cell" });
    cell.dataset.phaseCol = String(i);
    cells.push(cell);

    const svg = createSvgEl("svg", {
      class: "vzd-journey-mood-svg",
      viewBox: "0 0 100 100",
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    });
    cell.appendChild(svg);

    const mood = phase.mood;
    if (mood !== undefined) {
      const y = moodY(mood);
      const prev = phases[i - 1]?.mood;
      const next = phases[i + 1]?.mood;
      let d = "";
      if (prev !== undefined) {
        const yl = (moodY(prev) + y) / 2;
        d += `M 0 ${yl} C 25 ${yl}, 25 ${y}, 50 ${y} `;
      }
      if (next !== undefined) {
        const yr = (moodY(next) + y) / 2;
        d += `M 50 ${y} C 75 ${y}, 75 ${yr}, 100 ${yr}`;
      }
      if (d) svg.appendChild(createSvgEl("path", { d: d.trim(), class: "vzd-journey-mood-line" }));

      // The point is HTML, not SVG: the stretched viewBox would squash a circle.
      const point = cell.createEl("span", { cls: "vzd-journey-mood-point" });
      point.style.top = `${y}%`;
      point.setAttribute("data-vzd-tone", moodTone(mood));
      const label = `${t("journey.lane.mood")}: ${formatMood(mood)} — ${t(`journey.mood.${mood}` as Parameters<typeof t>[0])}`;
      point.setAttribute("title", label);
      point.setAttribute("aria-label", label);
      point.setAttribute("role", "img");
      point.createEl("span", { cls: "vzd-journey-mood-value", text: formatMood(mood) });
    }

    if (onSet) {
      const open = (anchor: HTMLElement): void => {
        const r = anchor.getBoundingClientRect();
        const menu = new Menu();
        for (let m = MOOD_MAX; m >= MOOD_MIN; m--) {
          menu.addItem(item => {
            item.setTitle(`${formatMood(m)}  ${t(`journey.mood.${m}` as Parameters<typeof t>[0])}`);
            item.setChecked(m === mood);
            item.onClick(() => onSet(phase.name, m));
          });
        }
        if (mood !== undefined) {
          menu.addSeparator();
          menu.addItem(item => item.setTitle(t("journey.mood.clear")).onClick(() => onSet(phase.name, null)));
        }
        menu.showAtPosition({ x: r.left, y: r.bottom }, cell.ownerDocument);
      };
      const point = cell.querySelector<HTMLElement>(".vzd-journey-mood-point");
      if (point) {
        point.addClass("vzd-journey-mood-point--editable");
        point.setAttribute("role", "button");
        point.setAttribute("tabindex", "0");
        point.addEventListener("click", (e) => { e.stopPropagation(); open(point); });
        point.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          open(point);
        });
      } else {
        const add = createAddControl(cell, {
          label: t("journey.mood.set"),
          variant: "dot",
          cls: "vzd-journey-mood-add",
          alwaysVisible: true,
          onAdd: () => open(add),
        });
      }
    }
  });
  return cells;
}

// ── Meta badge (persona / scenario) ────────────────────────────────────────

function renderMetaBadge(
  parent: HTMLElement,
  key: "persona" | "scenario",
  label: string,
  value: string,
  isEditMode: boolean,
  app: App | undefined,
  ctx: MarkdownPostProcessorContext | undefined,
  container: HTMLElement,
): void {
  if (!value && !isEditMode) return;

  const displayText = value ? `${label}: ${value}` : `${label}: —`;
  const span = parent.createEl("span", {
    cls: "vzd-journey-meta-item" + (isEditMode ? " vzd-journey-meta-item--editable" : ""),
    text: displayText,
  });

  if (!isEditMode || !app || !ctx) return;

  span.addEventListener("click", (e) => {
    e.stopPropagation();
    activateInlineEdit(span, value, (v) => writeJourneyMeta(app, ctx, container, key, v), {
      shouldCommit: () => true,
      renderDisplay: (h, v) => { h.textContent = v ? `${label}: ${v}` : `${label}: —`; },
    });
  });
}

// ── Carousel ─────────────────────────────────────────────────────────────

function setupJourneyCarousel(
  container: HTMLElement,
  grid: HTMLElement,
  phaseNames: string[],
  phaseHeaderEls: HTMLElement[],
  cellsByPhase: HTMLElement[][],
): void {
  const total = phaseNames.length;
  if (total <= 1) return;

  let current = 0;
  const mq = ownerWindow(container).matchMedia("(max-width: 600px)");

  const laneCellsEls = Array.from(
    grid.querySelectorAll(".vzd-journey-lane-cells")
  ) as HTMLElement[];

  const nav = container.createEl("div", { cls: "vzd-journey-nav" });
  const prevBtn = nav.createEl("button", { cls: "vzd-journey-nav-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(prevBtn, "chevron-left");
  prevBtn.setAttribute("aria-label", t("nav.previousStep"));
  const label = nav.createEl("span", { cls: "vzd-journey-nav-label" });
  const nextBtn = nav.createEl("button", { cls: "vzd-journey-nav-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(nextBtn, "chevron-right");
  nextBtn.setAttribute("aria-label", t("nav.nextStep"));

  function applyMobile(col: number): void {
    grid.style.gridTemplateColumns = "1fr";
    laneCellsEls.forEach(el => { el.style.gridTemplateColumns = "1fr"; });

    phaseHeaderEls.forEach((el, i) => {
      el.style.display = i === col ? "" : "none";
      el.style.gridColumn = "1";
    });

    cellsByPhase.forEach((cells, i) => {
      cells.forEach(cell => {
        cell.style.display = i === col ? "" : "none";
        cell.style.gridColumn = "1";
      });
    });

    setInline(label, phaseNames[col] ?? "");
    prevBtn.disabled = col === 0;
    nextBtn.disabled = col === total - 1;
  }

  function resetLayout(): void {
    grid.style.gridTemplateColumns = "";
    laneCellsEls.forEach(el => { el.style.gridTemplateColumns = ""; });
    phaseHeaderEls.forEach(el => {
      el.style.display = "";
      el.style.gridColumn = "";
    });
    cellsByPhase.forEach(cells => cells.forEach(cell => {
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
