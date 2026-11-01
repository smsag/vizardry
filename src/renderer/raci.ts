import type { App, MarkdownPostProcessorContext } from "obsidian";
import { Menu, Notice } from "obsidian";
import type { RACIData, RACIRow } from "../types";
import { t } from "../i18n";
import { initCanvas, renderHeadingLink, renderCanvasWarnings } from "./controls";
import { editTextInPlace } from "./inline-edit";
import { createAddControl } from "./add-control";
import { appendRACITask, writeRACICell, writeRACIRoles, writeRACIRolesMany } from "../shared/raci-edit";
import {
  RACI_ROLES, raciIssues, raciPeople, rolesOf, withRenamedPerson, withRole, type RACIRole,
} from "../raci";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import type { RenderContext } from "./render-context";
import { createInlineEl } from "../shared/inline-markdown";

/**
 * RACI Matrix — a real matrix: one row per task, one column per person, and
 * the role each person plays on each task as a letter in the crossing cell.
 *
 * The source is written per task (`responsible: Dev, QA`), which is easy to
 * type but was rendered as five independent lists: row alignment held only
 * while every list kept the same line count, and nobody could read a column
 * to see what one person owns. The matrix answers the questions a RACI chart
 * is for — who is accountable here, who is overloaded, which task has no
 * owner — and flags the last one in the row.
 *
 * The letters are the framework's own (R/A/C/I in every language); emphasis
 * runs from A (filled) through R (tinted) and C (outlined) to I (plain), so
 * the chart still reads in monochrome, in sketch mode and on paper.
 */

const LETTER: Record<RACIRole, string> = {
  responsible: "R", accountable: "A", consulted: "C", informed: "I",
};

const roleLabel = (role: RACIRole): string => t(`raci.col.${role}`);

function renderBadge(parent: HTMLElement, role: RACIRole): void {
  const badge = parent.createEl("span", { cls: `vzd-raci-badge vzd-raci-badge--${role}`, text: LETTER[role] });
  badge.setAttribute("title", roleLabel(role));
}

function renderLegend(container: HTMLElement): void {
  const legend = container.createEl("div", { cls: "vzd-raci-legend" });
  for (const role of RACI_ROLES) {
    const item = legend.createEl("span", { cls: "vzd-raci-legend-item" });
    renderBadge(item, role);
    item.createEl("span", { cls: "vzd-raci-legend-term", text: roleLabel(role) });
    item.createEl("span", { cls: "vzd-raci-legend-hint", text: t(`raci.hint.${role}`) });
  }
}

interface EditCtx {
  app: App;
  ctx: MarkdownPostProcessorContext;
  container: HTMLElement;
}

const failed = (ok: boolean): void => { if (!ok) new Notice(t("edit.writeFailed")); };

function openRoleMenu(e: MouseEvent, row: RACIRow, rowIndex: number, person: string, ed: EditCtx): void {
  const current = rolesOf(row, person);
  const menu = new Menu();
  const choose = (role: RACIRole | null): void =>
    failed(writeRACIRoles(ed.app, ed.ctx, ed.container, rowIndex, withRole(row, person, role)));
  for (const role of RACI_ROLES) {
    menu.addItem(item => {
      item.setTitle(`${LETTER[role]} · ${roleLabel(role)}`);
      item.setChecked(current.length === 1 && current[0] === role);
      item.onClick(() => choose(role));
    });
  }
  menu.addSeparator();
  menu.addItem(item => {
    item.setTitle(t("raci.notInvolved"));
    item.setChecked(current.length === 0);
    item.onClick(() => choose(null));
  });
  menu.showAtMouseEvent(e);
}

function renameTask(nameEl: HTMLElement, task: string, rowIndex: number, ed: EditCtx): void {
  editTextInPlace(nameEl, {
    initial: task,
    onDone: (commit, value) => {
      const next = value.trim();
      if (!commit || !next || next === task) { nameEl.textContent = task; return; }
      failed(writeRACICell(ed.app, ed.ctx, ed.container, rowIndex, "task", next));
    },
  });
}

function renamePerson(nameEl: HTMLElement, person: string, rows: RACIRow[], ed: EditCtx): void {
  editTextInPlace(nameEl, {
    initial: person,
    onDone: (commit, value) => {
      const next = value.trim().replace(/,/g, " ");
      if (!commit || !next || next === person) { nameEl.textContent = person; return; }
      const updates = new Map<number, ReturnType<typeof withRenamedPerson>>();
      rows.forEach((row, i) => {
        if (rolesOf(row, person).length > 0) updates.set(i, withRenamedPerson(row, person, next));
      });
      failed(writeRACIRolesMany(ed.app, ed.ctx, ed.container, updates));
    },
  });
}

function renderTable(
  wrap: HTMLElement,
  rows: RACIRow[],
  people: string[],
  rc: RenderContext,
  ed: EditCtx | null,
): void {
  wrap.empty();
  const { resolver, navigateTo, app, ctx } = rc;
  const table = wrap.createEl("table", { cls: "vzd-raci-table" });

  const headRow = table.createEl("thead").createEl("tr");
  headRow.createEl("th", { cls: "vzd-raci-th vzd-raci-th--task", text: t("raci.col.task") });
  for (const person of people) {
    const th = headRow.createEl("th", { cls: "vzd-raci-th vzd-raci-th--person" });
    th.setAttribute("scope", "col");
    const name = createInlineEl(th, "span", "vzd-raci-person", person);
    renderHeadingLink(th, person, resolver, navigateTo, app, ctx?.sourcePath);
    if (ed) {
      name.addClass("vzd-raci-editable");
      name.addEventListener("click", () => renamePerson(name, person, rows, ed));
    }
  }
  if (ed) {
    const th = headRow.createEl("th", { cls: "vzd-raci-th vzd-raci-th--add" });
    createAddControl(th, {
      label: t("raci.addPerson"),
      variant: "dot",
      onAdd: () => {
        // A person exists in the source only through a role, so a new column
        // is local until a cell in it is given one — that write re-renders
        // the canvas from the source, where the name now appears.
        renderTable(wrap, rows, [...people, t("raci.newPerson")], rc, ed);
        const added = wrap.querySelectorAll<HTMLElement>(".vzd-raci-person");
        const el = added[added.length - 1];
        if (!el) return;
        editTextInPlace(el, {
          initial: el.textContent ?? "",
          selectAll: true,
          onDone: (commit, value) => {
            const next = value.trim().replace(/,/g, " ");
            renderTable(wrap, rows, commit && next ? [...people, next] : people, rc, ed);
          },
        });
      },
    });
  }

  const tbody = table.createEl("tbody");
  rows.forEach((row, rowIndex) => {
    const tr = tbody.createEl("tr", { cls: "vzd-raci-row" });
    const taskCell = tr.createEl("th", { cls: "vzd-raci-task" });
    taskCell.setAttribute("scope", "row");
    const taskLine = taskCell.createEl("div", { cls: "vzd-raci-task-line" });
    const name = createInlineEl(taskLine, "span", "vzd-raci-task-name", row.task);
    renderHeadingLink(taskLine, row.task, resolver, navigateTo, app, ctx?.sourcePath);
    if (ed) {
      name.addClass("vzd-raci-editable");
      name.addEventListener("click", () => renameTask(name, row.task, rowIndex, ed));
    }
    const issues = raciIssues(row);
    if (issues.length > 0) {
      tr.addClass("vzd-raci-row--issue");
      const list = taskCell.createEl("div", { cls: "vzd-raci-issues" });
      list.setAttribute("data-vzd-tone", "caution");
      for (const issue of issues) list.createEl("span", { cls: "vzd-raci-issue", text: t(`raci.issue.${issue}`) });
    }

    for (const person of people) {
      const td = tr.createEl("td", { cls: "vzd-raci-cell" });
      const roles = rolesOf(row, person);
      td.setAttribute("aria-label", `${t("raci.cellLabel", { person, task: row.task })}: ${
        roles.length ? roles.map(roleLabel).join(", ") : t("raci.notInvolved")}`);
      for (const role of roles) renderBadge(td, role);
      if (ed) {
        td.addClass("vzd-raci-cell--editable");
        td.setAttribute("tabindex", "0");
        td.addEventListener("click", (e) => openRoleMenu(e, row, rowIndex, person, ed));
        td.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          const r = td.getBoundingClientRect();
          openRoleMenu(new MouseEvent("click", { clientX: r.left, clientY: r.bottom }), row, rowIndex, person, ed);
        });
      }
    }
    if (ed) tr.createEl("td", { cls: "vzd-raci-cell vzd-raci-cell--add" });
  });

  // Workload: how much each person does (R) and owns (A). Only worth a row
  // once there is more than one task to add up.
  if (rows.length > 1 && people.length > 0) {
    const tr = table.createEl("tfoot").createEl("tr", { cls: "vzd-raci-workload" });
    tr.createEl("th", { cls: "vzd-raci-task vzd-raci-workload-label", text: t("raci.workload") });
    for (const person of people) {
      const td = tr.createEl("td", { cls: "vzd-raci-cell" });
      for (const role of ["responsible", "accountable"] as const) {
        const n = rows.filter(r => rolesOf(r, person).includes(role)).length;
        if (n === 0) continue;
        const stat = td.createEl("span", { cls: "vzd-raci-stat" });
        stat.createEl("span", { cls: "vzd-raci-stat-n", text: String(n) });
        stat.createEl("span", { cls: "vzd-raci-stat-role", text: LETTER[role] });
        stat.setAttribute("title", roleLabel(role));
      }
    }
    if (ed) tr.createEl("td", { cls: "vzd-raci-cell vzd-raci-cell--add" });
  }

  if (rows.length === 0 || people.length === 0) {
    const hint = wrap.createEl("div", { cls: "vzd-raci-empty", text: t(rows.length === 0 ? "raci.empty" : "raci.noPeople") });
    hint.setAttribute("role", "note");
  }
}

export function renderRACIMatrix(
  data: RACIData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { source, app, ctx } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "RACI Matrix";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "raci", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data?.warnings);

  const rows = data?.rows ?? [];
  const ed: EditCtx | null = isEditMode ? { app: app!, ctx: ctx!, container } : null;

  // Scrolls sideways on a phone with the task column pinned, instead of the
  // one-column-at-a-time carousel the old five-list layout needed.
  // One root for table, add control and legend, so the presentation view
  // (which clones a canvas's content root) shows the key too.
  const root = container.createEl("div", { cls: "vzd-raci" });
  const wrap = root.createEl("div", { cls: "vzd-raci-wrap" });
  renderTable(wrap, rows, raciPeople(rows), rc, ed);

  if (ed) {
    createAddControl(root, {
      label: t("raci.addTask"),
      cls: "vzd-raci-add-task",
      alwaysVisible: rows.length === 0,
      onAdd: () => failed(appendRACITask(ed.app, ed.ctx, ed.container, t("raci.newTask"))),
    });
  }
  renderLegend(root);
}
