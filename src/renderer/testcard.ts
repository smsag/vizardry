import type { TestCardData, TestCardGauge, TestCardStep } from "../types/testcard";
import { TEST_CARD_MAX_LEVEL } from "../types/testcard";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { activateInlineEdit, activateTextareaEdit } from "./inline-edit";
import { writeTestCardField, writeTestCardGauge } from "../shared/testcard-edit";

const DEADLINE_KEY = "deadline";

/** Reads the `deadline:` value the same free-text way `period:` is read. */
function parseDeadline(source: string): string {
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(`${DEADLINE_KEY}:`)) {
      return trimmed.slice(DEADLINE_KEY.length + 1).trim().slice(0, 60);
    }
  }
  return "";
}

export function renderTestCard(
  data: TestCardData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const editable = !!(app && ctx && source !== undefined && isEditModeActive(app));
  const defaultTitle = "Test Card";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (editable && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;

  const deadline = source !== undefined ? parseDeadline(source) : data.deadline;
  const extraHeader = (header: HTMLElement): void =>
    renderDeadline(header, container, deadline, editable, rc);

  initCanvas(container, "testcard", title, extraHeader, source, onTitleEdit, app, ctx);

  const card = container.createEl("div", { cls: "vzd-tc" });
  for (const step of data.steps) renderStep(card, step, editable, rc);

  renderCanvasWarnings(container, data.warnings);
}

/** Deadline chip in the header — reuses the `period:` field's chip styling. */
function renderDeadline(
  header: HTMLElement,
  container: HTMLElement,
  value: string,
  editable: boolean,
  rc: RenderContext,
): void {
  if (!value && !editable) return;
  const field = header.createEl("div", { cls: "vizardry-period vzd-tc-deadline" });
  field.createEl("span", { cls: "vizardry-period-label", text: "Deadline" });
  const valueEl = field.createEl("span", { cls: "vizardry-period-value" });
  if (value) valueEl.setText(value);
  else { valueEl.addClass("vizardry-period-value--empty"); valueEl.setText("Set deadline"); }

  if (editable) {
    valueEl.addClass("vizardry-period-value--editable");
    valueEl.addEventListener("click", (e) => {
      e.stopPropagation();
      activateInlineEdit(valueEl, value, (next) => {
        writeTestCardField(rc.app!, rc.ctx!, container, DEADLINE_KEY, next);
      }, { shouldCommit: (v, cur) => v !== cur }); // allow clearing
    });
  }

  const actions = header.querySelector(".vizardry-header-actions");
  if (actions) header.insertBefore(field, actions);
}

function renderStep(
  card: HTMLElement,
  step: TestCardStep,
  editable: boolean,
  rc: RenderContext,
): void {
  const el = card.createEl("div", { cls: `vzd-tc-step vzd-tc-step--${step.key}` });
  el.createEl("div", { cls: "vzd-tc-eyebrow", text: step.eyebrow });

  const body = el.createEl("div", { cls: "vzd-tc-body" });
  body.createEl("span", { cls: "vzd-tc-prompt", text: step.prompt });

  const fill = body.createEl("div", { cls: "vzd-tc-fill" });
  renderFill(fill, step.text, editable);
  if (editable) {
    fill.addClass("vzd-tc-fill--editable");
    fill.addEventListener("click", () => {
      activateTextareaEdit(fill, fill, step.text, (next) => {
        const canvas = fill.closest(".vizardry-canvas") as HTMLElement | null;
        if (canvas) writeTestCardField(rc.app!, rc.ctx!, canvas, step.key, next);
      }, {
        textareaClass: "vzd-tc-textarea",
        renderDisplay: (host, value) => renderFill(host, value, editable),
      });
    });
  }

  if (step.gauges.length) {
    const gaugeRow = el.createEl("div", { cls: "vzd-tc-gauges" });
    for (const gauge of step.gauges) renderGauge(gaugeRow, gauge, editable, rc);
  }
}

/** Fill-in display: the text, or a faint placeholder when empty and editable. */
function renderFill(host: HTMLElement, value: string, editable: boolean): void {
  host.empty();
  if (value) {
    host.removeClass("vzd-tc-fill--empty");
    host.setText(value);
  } else {
    host.addClass("vzd-tc-fill--empty");
    host.setText(editable ? "Write here…" : "");
  }
}

/** A labelled 1–3 level gauge (dots). Click a dot to set the level; clicking the
 *  highest filled dot clears it. Read-only when not editable. */
function renderGauge(
  row: HTMLElement,
  gauge: TestCardGauge,
  editable: boolean,
  rc: RenderContext,
): void {
  const wrap = row.createEl("div", { cls: "vzd-tc-gauge" });
  wrap.createEl("span", { cls: "vzd-tc-gauge-label", text: gauge.label });
  const dots = wrap.createEl("div", {
    cls: "vzd-tc-dots",
    attr: { role: "slider", "aria-label": gauge.label, "aria-valuemin": "0", "aria-valuemax": String(TEST_CARD_MAX_LEVEL), "aria-valuenow": String(gauge.level) },
  });

  let level = gauge.level;
  const paint = (): void => {
    dots.setAttribute("aria-valuenow", String(level));
    Array.from(dots.children).forEach((d, i) =>
      d.classList.toggle("is-filled", i < level));
  };

  for (let i = 1; i <= TEST_CARD_MAX_LEVEL; i++) {
    const dot = dots.createEl("span", { cls: "vzd-tc-dot" });
    if (editable) {
      dot.addClass("vzd-tc-dot--editable");
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        level = (i === level) ? i - 1 : i; // clicking the top filled dot clears one
        paint();
        const canvas = dots.closest(".vizardry-canvas") as HTMLElement | null;
        if (canvas) writeTestCardGauge(rc.app!, rc.ctx!, canvas, gauge.key, level);
      });
    }
  }
  paint();
}
