import type { App, MarkdownPostProcessorContext } from "obsidian";
import { createAddControl } from "./add-control";
import { Notice } from "obsidian";
import type { ProContraArgument, ProContraData, ProContraOption, ProContraSide } from "../types/procontra";
import { PRO_CONTRA_MAX_WEIGHT, proContraTotals } from "../types/procontra";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { attachItemMenu } from "../shared/item-menu";
import { activateInlineEdit } from "./inline-edit";
import { renderHeaderChip } from "./header-chip";
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

  const root = container.createEl("div", { cls: edit ? "vzd-pc vzd-pc--editable" : "vzd-pc" });
  renderQuestion(root, data.question, edit);

  // An empty block still gets a board, so the first argument can be added.
  const options = data.options.length
    ? data.options
    : [{ name: "", ref: -1, pros: [], cons: [] }];
  const multi = options.length > 1;
  const leader = multi ? leadingOption(options) : null;
  const chosen = chosenOption(options, data.decision);

  const list = root.createEl("div", { cls: multi ? "vzd-pc-options" : "vzd-pc-single" });
  for (const option of options) {
    renderOption(list, option, { multi, chosen: option === chosen, leading: option === leader }, edit);
  }

  if (edit) {
    createAddControl(root, {
      label: t("procontra.addOption"),
      cls: "vzd-pc-add-option",
      onAdd: () => {
        const name = uniqueName(t("procontra.newOption"), options.map(o => o.name));
        if (!insertProContraOption(edit.app, edit.ctx, edit.container, name)) failed();
      },
    });
  }

  renderCanvasWarnings(container, data.warnings);
}

/** The option `decision:` names — the first one, should two share the name. */
export function chosenOption(options: ProContraOption[], decision: string): ProContraOption | null {
  const want = decision.trim().toLowerCase();
  if (!want) return null;
  return options.find(o => o.name.trim().toLowerCase() === want) ?? null;
}

/** `base`, or `base 2`, `base 3`… — the first not already taken (case-insensitive). */
export function uniqueName(base: string, taken: string[]): string {
  const used = new Set(taken.map(n => n.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
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

/** `decision:` chip in the header. */
function renderDecisionChip(header: HTMLElement, value: string, edit: Edit | undefined): void {
  renderHeaderChip(header, {
    cls: "vzd-pc-decision",
    label: t("procontra.decision"),
    value,
    placeholder: t("procontra.setDecision"),
    allowClear: true,
    onCommit: edit
      ? (next) => { if (!writeProContraField(edit.app, edit.ctx, edit.container, "decision", next)) failed(); }
      : undefined,
  });
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
      if (!renameProContraOption(edit.app, edit.ctx, edit.container, option.ref, next, state.chosen)) failed();
    }, { renderDisplay: paint });
  });

  attachItemMenu(head, {
    label: t("menu.actionsFor", { name: option.name || t("procontra.untitledOption") }),
    button: { parent: head, cls: "vzd-pc-item-menu", placement: "row" },
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
    createAddControl(col, {
      label: t("procontra.addArgument"),
      alwaysVisible: items.length === 0,
      onAdd: () => {
        if (!insertProContraArg(edit.app, edit.ctx, edit.container, option.ref, side, t("procontra.newArgument"))) failed();
      },
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
    button: { parent: li, cls: "vzd-pc-item-menu", placement: "row" },
    actions: () => [
      { title: t(arg.side === "pro" ? "procontra.moveToCon" : "procontra.moveToPro"), icon: "arrow-left-right",
        onChoose: () => { if (!flipProContraArg(edit.app, edit.ctx, edit.container, arg.ref)) failed(); } },
      { title: t("procontra.deleteArgument"), icon: "trash-2", destructive: true,
        onChoose: () => { if (!removeProContraArg(edit.app, edit.ctx, edit.container, arg.ref)) failed(); } },
    ],
  });
}

/**
 * 1–3 weight dots. Editable, it is a keyboard slider too (arrows, Home/End);
 * a click or key sets the weight, rolled back if the write fails. Read-only,
 * it is announced as an image of the weight.
 */
function renderWeight(li: HTMLElement, arg: ProContraArgument, edit: Edit | undefined): void {
  const dots = li.createEl("span", { cls: "vzd-pc-dots" });
  let weight = arg.weight;
  const describe = (w: number): string => t("procontra.weightOf", { n: w, max: PRO_CONTRA_MAX_WEIGHT });
  const paint = (): void => {
    Array.from(dots.children).forEach((d, i) => d.classList.toggle("is-filled", i < weight));
    if (edit) {
      dots.setAttribute("aria-valuenow", String(weight));
      dots.setAttribute("aria-valuetext", describe(weight));
    } else {
      dots.setAttribute("aria-label", describe(weight));
    }
  };
  for (let i = 1; i <= PRO_CONTRA_MAX_WEIGHT; i++) dots.createEl("span", { cls: "vzd-pc-dot" });

  if (!edit) {
    dots.setAttribute("role", "img");
    paint();
    return;
  }

  dots.addClass("vzd-pc-dots--editable");
  dots.setAttribute("role", "slider");
  dots.setAttribute("tabindex", "0");
  dots.setAttribute("aria-label", t("procontra.weight"));
  dots.setAttribute("aria-valuemin", "1");
  dots.setAttribute("aria-valuemax", String(PRO_CONTRA_MAX_WEIGHT));

  const set = (next: number): void => {
    const clamped = Math.max(1, Math.min(PRO_CONTRA_MAX_WEIGHT, next));
    if (clamped === weight) return;
    const prev = weight;
    weight = clamped;
    paint();
    if (!writeProContraArgWeight(edit.app, edit.ctx, edit.container, arg.ref, weight)) {
      weight = prev;
      paint();
      failed();
    }
  };

  Array.from(dots.children).forEach((dot, i) => {
    dot.addClass("vzd-pc-dot--editable");
    dot.addEventListener("click", (e) => { e.stopPropagation(); set(i + 1); });
  });
  dots.addEventListener("keydown", (e) => {
    const step: Record<string, number> = {
      ArrowRight: weight + 1, ArrowUp: weight + 1,
      ArrowLeft: weight - 1, ArrowDown: weight - 1,
      Home: 1, End: PRO_CONTRA_MAX_WEIGHT,
    };
    if (!(e.key in step)) return;
    e.preventDefault();
    e.stopPropagation();
    set(step[e.key]);
  });
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
