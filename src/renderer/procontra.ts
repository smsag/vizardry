import type { App, MarkdownPostProcessorContext } from "obsidian";
import { Notice } from "obsidian";
import type { ProContraArgument, ProContraData, ProContraOption, ProContraSide } from "../types/procontra";
import { PRO_CONTRA_MAX_WEIGHT, proContraTotals } from "../types/procontra";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { attachItemMenu } from "../shared/item-menu";
import { activateInlineEdit } from "./inline-edit";
import {
  flipProContraArg, insertProContraArg, insertProContraOption, removeProContraArg,
  removeProContraOption, renameProContraOption, writeProContraArgText,
  writeProContraArgWeight, writeProContraField,
} from "../shared/procontra-edit";
import { t } from "../i18n";

/**
 * Pro / Contra — a weighted pros-and-cons board. A single option renders as
 * the classic two-column T-chart; several options render as cards side by
 * side, each with its own balance bar, the leader marked and the `decision:`
 * badged. The score only advises: nothing is decided automatically.
 *
 * Edits in place in Live Preview — click to edit any text, click a weight dot,
 * `+` to add, and the item menu to move an argument across or delete it.
 */

interface Edit {
  app: App;
  ctx: MarkdownPostProcessorContext;
  container: HTMLElement;
}

const failed = (): void => { new Notice(t("edit.writeFailed")); };

export function renderProContra(
  data: ProContraData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const editable = !!(app && ctx && source !== undefined && isEditModeActive(app));
  const edit: Edit | undefined = editable ? { app: app!, ctx: ctx!, container } : undefined;
  const defaultTitle = "Pro / Contra";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (editable && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;

  initCanvas(container, "procontra", title, (header) => renderDecisionChip(header, data.decision, edit), source, onTitleEdit, app, ctx);

  const root = container.createEl("div", { cls: "vzd-pc" });
  renderQuestion(root, data.question, edit);

  // An empty block still gets a board, so the first argument can be added.
  const options = data.options.length
    ? data.options
    : [{ name: "", ref: -1, pros: [], cons: [] }];
  const multi = options.length > 1;
  const leader = multi ? leadingOption(options) : null;
  const decision = data.decision.trim().toLowerCase();

  const list = root.createEl("div", { cls: multi ? "vzd-pc-options" : "vzd-pc-single" });
  for (const option of options) {
    const chosen = !!decision && !!option.name && option.name.trim().toLowerCase() === decision;
    renderOption(list, option, { multi, chosen, leading: option === leader, decision: data.decision }, edit);
  }

  if (edit) {
    const add = root.createEl("button", { cls: "vzd-pc-add vzd-pc-add-option", text: `+ ${t("procontra.addOption")}` });
    add.setAttribute("type", "button");
    add.addEventListener("click", () => {
      if (!insertProContraOption(edit.app, edit.ctx, edit.container, t("procontra.newOption"))) failed();
    });
  }

  renderCanvasWarnings(container, data.warnings);
}

/** The single option with the highest net score, or null on a tie / no arguments. */
function leadingOption(options: ProContraOption[]): ProContraOption | null {
  let best: ProContraOption | null = null;
  let bestNet = -Infinity;
  let tie = false;
  for (const o of options) {
    if (o.pros.length + o.cons.length === 0) continue;
    const { net } = proContraTotals(o);
    if (net > bestNet) { best = o; bestNet = net; tie = false; }
    else if (net === bestNet) tie = true;
  }
  return tie ? null : best;
}

/** `decision:` chip in the header — reuses the `period:` field's chip styling. */
function renderDecisionChip(header: HTMLElement, value: string, edit: Edit | undefined): void {
  if (!value && !edit) return;
  const field = header.createEl("div", { cls: "vizardry-period vzd-pc-decision" });
  field.createEl("span", { cls: "vizardry-period-label", text: t("procontra.decision") });
  const valueEl = field.createEl("span", { cls: "vizardry-period-value" });
  if (value) valueEl.setText(value);
  else { valueEl.addClass("vizardry-period-value--empty"); valueEl.setText(t("procontra.setDecision")); }

  if (edit) {
    valueEl.addClass("vizardry-period-value--editable");
    valueEl.addEventListener("click", (e) => {
      e.stopPropagation();
      activateInlineEdit(valueEl, value, (next) => {
        if (!writeProContraField(edit.app, edit.ctx, edit.container, "decision", next)) failed();
      }, { shouldCommit: (v, cur) => v !== cur }); // allow clearing
    });
  }

  const actions = header.querySelector(".vizardry-header-actions");
  if (actions) header.insertBefore(field, actions);
}

function renderQuestion(root: HTMLElement, question: string, edit: Edit | undefined): void {
  if (!question && !edit) return;
  const el = root.createEl("div", { cls: "vzd-pc-question" });
  const paint = (host: HTMLElement, v: string): void => {
    host.setText(v || t("procontra.question"));
    host.toggleClass("vzd-pc-question--empty", !v);
  };
  paint(el, question);
  if (!edit) return;
  el.addClass("vzd-pc-editable");
  el.addEventListener("click", () => {
    activateInlineEdit(el, question, (next) => {
      if (!writeProContraField(edit.app, edit.ctx, edit.container, "question", next)) failed();
    }, { shouldCommit: (v, cur) => v !== cur, renderDisplay: paint });
  });
}

interface OptionState {
  multi: boolean;
  chosen: boolean;
  leading: boolean;
  decision: string;
}

function renderOption(list: HTMLElement, option: ProContraOption, state: OptionState, edit: Edit | undefined): void {
  const card = list.createEl("div", { cls: "vzd-pc-option" });
  if (state.chosen) card.addClass("is-chosen");
  if (state.leading) card.addClass("is-leading");

  // A lone implicit option is the plain T-chart: no card header.
  if (state.multi || option.name) renderOptionHead(card, option, state, edit);

  const totals = proContraTotals(option);
  const cols = card.createEl("div", { cls: "vzd-pc-cols" });
  renderColumn(cols, option, "pro", option.pros, totals.pro, edit);
  renderColumn(cols, option, "con", option.cons, totals.con, edit);
  renderBalance(card, totals);
}

function renderOptionHead(card: HTMLElement, option: ProContraOption, state: OptionState, edit: Edit | undefined): void {
  const head = card.createEl("div", { cls: "vzd-pc-option-head" });
  const name = head.createEl("div", { cls: "vzd-pc-option-name" });
  const paint = (host: HTMLElement, v: string): void => {
    host.setText(v || t("procontra.untitledOption"));
    host.toggleClass("vzd-pc-option-name--empty", !v);
  };
  paint(name, option.name);

  if (state.chosen) head.createEl("span", { cls: "vzd-pc-badge vzd-pc-badge--chosen", text: t("procontra.chosen") });
  else if (state.leading) head.createEl("span", { cls: "vzd-pc-badge vzd-pc-badge--leading", text: t("procontra.leading") });

  if (!edit) return;
  name.addClass("vzd-pc-editable");
  name.addEventListener("click", () => {
    activateInlineEdit(name, option.name, (next) => {
      if (!renameProContraOption(edit.app, edit.ctx, edit.container, option.ref, option.name, next)) failed();
    }, { renderDisplay: paint });
  });

  attachItemMenu(head, {
    label: t("menu.actionsFor", { name: option.name || t("procontra.untitledOption") }),
    button: { parent: head, cls: "vzd-pc-item-menu vzd-btn" },
    actions: () => [
      ...(option.name ? [state.chosen
        ? { title: t("procontra.clearDecision"), icon: "circle-off",
            onChoose: () => { if (!writeProContraField(edit.app, edit.ctx, edit.container, "decision", "")) failed(); } }
        : { title: t("procontra.choose"), icon: "check-circle",
            onChoose: () => { if (!writeProContraField(edit.app, edit.ctx, edit.container, "decision", option.name)) failed(); } },
      ] : []),
      { title: t("procontra.deleteOption"), icon: "trash-2", destructive: true,
        onChoose: () => { if (!removeProContraOption(edit.app, edit.ctx, edit.container, option.ref)) failed(); } },
    ],
  });
}

function renderColumn(
  cols: HTMLElement, option: ProContraOption, side: ProContraSide,
  items: ProContraArgument[], total: number, edit: Edit | undefined,
): void {
  const col = cols.createEl("div", { cls: `vzd-pc-col vzd-pc-col--${side}` });
  const head = col.createEl("div", { cls: "vzd-pc-col-head" });
  head.createEl("span", { cls: "vzd-pc-col-label", text: t(side === "pro" ? "procontra.pro" : "procontra.con") });
  head.createEl("span", { cls: "vzd-pc-col-total", text: String(total) });

  const ul = col.createEl("ul", { cls: "vzd-pc-items" });
  for (const arg of items) renderArgument(ul, arg, edit);

  if (edit) {
    const add = col.createEl("button", { cls: "vzd-pc-add", text: `+ ${t("procontra.addArgument")}` });
    add.setAttribute("type", "button");
    add.addEventListener("click", () => {
      if (!insertProContraArg(edit.app, edit.ctx, edit.container, option.ref, side, t("procontra.newArgument"))) failed();
    });
  }
}

function renderArgument(ul: HTMLElement, arg: ProContraArgument, edit: Edit | undefined): void {
  const li = ul.createEl("li", { cls: "vzd-pc-item" });
  renderWeight(li, arg, edit);
  const text = li.createEl("span", { cls: "vzd-pc-text", text: arg.text });
  if (!edit) return;

  text.addClass("vzd-pc-editable");
  text.addEventListener("click", () => {
    activateInlineEdit(text, arg.text, (next) => {
      if (!writeProContraArgText(edit.app, edit.ctx, edit.container, arg.ref, next)) failed();
    });
  });

  attachItemMenu(li, {
    label: t("menu.actionsFor", { name: arg.text }),
    button: { parent: li, cls: "vzd-pc-item-menu vzd-btn" },
    actions: () => [
      { title: t(arg.side === "pro" ? "procontra.moveToCon" : "procontra.moveToPro"), icon: "arrow-left-right",
        onChoose: () => { if (!flipProContraArg(edit.app, edit.ctx, edit.container, arg.ref)) failed(); } },
      { title: t("procontra.deleteArgument"), icon: "trash-2", destructive: true,
        onChoose: () => { if (!removeProContraArg(edit.app, edit.ctx, edit.container, arg.ref)) failed(); } },
    ],
  });
}

/** 1–3 weight dots. Click a dot to set the weight (minimum 1). */
function renderWeight(li: HTMLElement, arg: ProContraArgument, edit: Edit | undefined): void {
  const dots = li.createEl("span", {
    cls: "vzd-pc-dots",
    attr: {
      role: "slider", "aria-label": t("procontra.weight"),
      "aria-valuemin": "1", "aria-valuemax": String(PRO_CONTRA_MAX_WEIGHT), "aria-valuenow": String(arg.weight),
    },
  });
  let weight = arg.weight;
  const paint = (): void => {
    dots.setAttribute("aria-valuenow", String(weight));
    Array.from(dots.children).forEach((d, i) => d.classList.toggle("is-filled", i < weight));
  };
  for (let i = 1; i <= PRO_CONTRA_MAX_WEIGHT; i++) {
    const dot = dots.createEl("span", { cls: "vzd-pc-dot" });
    if (!edit) continue;
    dot.addClass("vzd-pc-dot--editable");
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      if (i === weight) return;
      weight = i;
      paint();
      if (!writeProContraArgWeight(edit.app, edit.ctx, edit.container, arg.ref, weight)) failed();
    });
  }
  paint();
}

/** Pro-vs-contra share bar with the net verdict. */
function renderBalance(card: HTMLElement, totals: { pro: number; con: number; net: number }): void {
  const wrap = card.createEl("div", { cls: "vzd-pc-balance" });
  const bar = wrap.createEl("div", { cls: "vzd-pc-balance-bar" });
  const sum = totals.pro + totals.con;
  if (sum > 0) {
    bar.createEl("span", { cls: "vzd-pc-balance-pro" }).style.flexGrow = String(totals.pro);
    bar.createEl("span", { cls: "vzd-pc-balance-con" }).style.flexGrow = String(totals.con);
  }
  const label = wrap.createEl("div", { cls: "vzd-pc-balance-label" });
  if (sum === 0) { label.setText(t("procontra.noArguments")); return; }
  const net = totals.net > 0 ? `+${totals.net}` : totals.net < 0 ? `−${-totals.net}` : "±0";
  const verdict = totals.net > 0 ? t("procontra.prosOutweigh") : totals.net < 0 ? t("procontra.consOutweigh") : t("procontra.balanced");
  label.createEl("span", { cls: "vzd-pc-net", text: net });
  label.createEl("span", { text: ` · ${verdict}` });
  wrap.addClass(totals.net > 0 ? "is-pro" : totals.net < 0 ? "is-con" : "is-even");
}
