import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import type { ParsedPaceLayers, PaceLayerCell, PaceLayerName } from "../types";
import { LAYER_CONFIG, LAYER_LABELS, TYPE_TRANSLATIONS, PROMPTS } from "../pacelayers";
import { initCanvas, markInteractive, renderHeadingLink } from "./controls";
import { activateTextareaEdit } from "./inline-edit";
import { setupSlideCarousel } from "./grid-carousel";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { writePaceLayerCell } from "../shared/pacelayers-edit";
import type { LinkResolver } from "../shared/links";
import type { RenderContext } from "./render-context";
import { t } from "../i18n";

export function renderPaceLayers(
  data: ParsedPaceLayers,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { source, app, ctx, resolver, navigateTo } = rc;
  const isEditMode = !!(app && ctx && source !== undefined)
    && app.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";
  const defaultTitle = 'Pace Layer Analysis';
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = isEditMode
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;

  initCanvas(container, 'pacelayers', title, undefined, source, onTitleEdit, app, ctx);

  if (data.context) {
    container.createDiv({ cls: 'vzd-pl-context', text: data.context });
  }

  const stack = container.createDiv('vzd-pl-stack');

  // ── Cell content rendering ───────────────────────────────────────────────────

  function renderCellContent(contentEl: HTMLElement, value: string, placeholder: string): void {
    contentEl.empty();
    contentEl.removeAttribute('data-placeholder');
    if (value.trim()) {
      value.split('\n').forEach(line => {
        const lineEl = contentEl.createDiv({ cls: 'vzd-block-line', text: line });
        renderHeadingLink(lineEl, line, resolver, navigateTo, app, ctx?.sourcePath);
      });
    } else {
      contentEl.setAttribute('data-placeholder', placeholder);
    }
    // Cache value so click handler always reads the latest
    contentEl.dataset.plValue = value;
  }

  // ── Inline edit ─────────────────────────────────────────────────────────────

  function activatePaceLayerEdit(
    cell: HTMLElement,
    contentEl: HTMLElement,
    layerName: string,
    cellKey: string,
    placeholder: string,
  ): void {
    const currentValue = (contentEl.dataset.plValue ?? '').trim();

    activateTextareaEdit(cell, contentEl, currentValue, (newValue) => {
      const written = writePaceLayerCell(app!, ctx!, container, layerName, cellKey, newValue, data.type);
      if (!written) new Notice(t('edit.writeFailed'));
    }, {
      editingClass: 'vzd-pl-editing',
      textareaClass: 'vzd-block-textarea',
      trimValue: false,
      onTab: 'indent',
      // CM6's replaceRange dispatches a transaction that scrolls the editor
      // to keep the changed line in view, causing the viewport to jump.
      // Capture the CM scroller position before the write and restore it on
      // the next animation frame, after CM has processed the change.
      wrapCommit: (write) => {
        const scroller = container.closest<HTMLElement>('.cm-scroller');
        const savedScrollTop = scroller?.scrollTop;
        write();
        if (scroller && savedScrollTop !== undefined) {
          requestAnimationFrame(() => { scroller.scrollTop = savedScrollTop; });
        }
      },
      renderDisplay: (host, value) => renderCellContent(host, value.trim(), placeholder),
    });
  }

  // ── Build rows ───────────────────────────────────────────────────────────────

  function renderSingleCell(
    parent: HTMLElement,
    cls: string,
    headerLabel: string | null,
    value: string,
    placeholder: string,
    layerName: PaceLayerName,
    cellKey: string,
  ): void {
    const cellEl = parent.createDiv(`${cls} vzd-block-editable`);
    cellEl.dataset.vzPlLayer = layerName;
    cellEl.dataset.vzPlKey = cellKey;

    if (headerLabel) {
      cellEl.createDiv({ cls: 'vzd-pl-cell-header', text: headerLabel });
    }

    const contentEl = cellEl.createDiv('vzd-pl-cell-content');
    renderCellContent(contentEl, value, placeholder);

    if (isEditMode) {
      markInteractive(cellEl);
      cellEl.addEventListener('click', (e) => {
        e.stopPropagation();
        activatePaceLayerEdit(cellEl, contentEl, layerName, cellKey, placeholder);
      });
    }
  }

  for (const config of LAYER_CONFIG) {
    const cell: PaceLayerCell = data.layers[config.name] ?? {};
    const trans = TYPE_TRANSLATIONS[data.type][config.name];
    const prompts = PROMPTS[config.name][data.type];

    const rowCls = `vzd-pl-row ${config.heightClass}${config.accentBorder ? ' vzd-pl-row--accent' : ''}`;
    const row = stack.createDiv(rowCls);
    row.setAttribute('data-layer', config.name);

    // Label column — display name is type-specific; YAML key stays canonical
    const labelCol = row.createDiv('vzd-pl-label-col');
    labelCol.createEl('span', { cls: 'vzd-pl-layer-name', text: LAYER_LABELS[data.type][config.name] });
    labelCol.createEl('span', { cls: 'vzd-pl-type-translation', text: trans });

    // Cells column
    const cellsCol = row.createDiv('vzd-pl-cells-col');

    if (config.cellMode === 'note') {
      renderSingleCell(
        cellsCol, 'vzd-pl-note', null,
        cell.note ?? '', prompts?.note ?? '',
        config.name, 'note',
      );
    } else {
      const trio = cellsCol.createDiv('vzd-pl-trio');
      renderSingleCell(trio, 'vzd-pl-cell vzd-pl-cell--obs',  'Observation', cell.obs  ?? '', prompts?.obs  ?? '', config.name, 'obs');
      renderSingleCell(trio, 'vzd-pl-cell vzd-pl-cell--feed', 'Feedback',    cell.feed ?? '', prompts?.feed ?? '', config.name, 'feed');
      renderSingleCell(trio, 'vzd-pl-cell vzd-pl-cell--idea', 'Idea',        cell.idea ?? '', prompts?.idea ?? '', config.name, 'idea');
    }
  }

  setupSlideCarousel(container, ".vzd-pl-row", "vzd-pl-row--active", LAYER_CONFIG.length);
}
