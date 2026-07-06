import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import type { ParsedPaceLayers, PaceLayerCell, PaceLayerName } from "../types";
import { LAYER_CONFIG, LAYER_LABELS, TYPE_TRANSLATIONS, PROMPTS } from "../pacelayers";
import { initCanvas, markInteractive } from "./controls";
import { setupPaceLayerCarousel } from "./grid-carousel";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { writePaceLayerCell } from "../shared/pacelayers-edit";
import { t } from "../i18n";

export function renderPaceLayers(
  data: ParsedPaceLayers,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const isEditMode = !!(app && ctx && source !== undefined)
    && app.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";
  const defaultTitle = 'Pace Layer Analysis';
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = isEditMode
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;

  initCanvas(container, 'pacelayers', title, undefined, source, onTitleEdit, app);

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
        contentEl.createDiv({ cls: 'vzd-block-line', text: line });
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
    if (cell.hasClass('vzd-pl-editing')) return;

    const currentValue = contentEl.dataset.plValue ?? '';

    cell.addClass('vzd-pl-editing');
    contentEl.empty();
    contentEl.removeAttribute('data-placeholder');

    const textarea = contentEl.createEl('textarea', { cls: 'vzd-plain-textarea vzd-block-textarea' });
    textarea.value = currentValue.trim();

    const resize = (): void => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    resize();
    textarea.addEventListener('input', resize);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    let committed = false;

    const commit = (): void => {
      if (committed) return;
      committed = true;
      const newValue = textarea.value;

      if (isEditMode) {
        // CM6's replaceRange dispatches a transaction that scrolls the editor
        // to keep the changed line in view, causing the viewport to jump.
        // Capture the CM scroller position before the write and restore it on
        // the next animation frame, after CM has processed the change.
        const scroller = container.closest<HTMLElement>('.cm-scroller');
        const savedScrollTop = scroller?.scrollTop;

        const written = writePaceLayerCell(app!, ctx!, container, layerName, cellKey, newValue, data.type);
        if (!written) {
          new Notice(t('edit.writeFailed'));
        }

        if (scroller && savedScrollTop !== undefined) {
          requestAnimationFrame(() => { scroller.scrollTop = savedScrollTop; });
        }
      }

      cell.removeClass('vzd-pl-editing');
      renderCellContent(contentEl, newValue.trim(), placeholder);
    };

    const cancel = (): void => {
      if (committed) return;
      committed = true;
      cell.removeClass('vzd-pl-editing');
      renderCellContent(contentEl, currentValue, placeholder);
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + '  ' + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        resize();
      }
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

  setupPaceLayerCarousel(container, LAYER_CONFIG.length);
}
