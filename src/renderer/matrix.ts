import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { MatrixData, MatrixType } from "../types";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n/locales/en";
import { initCanvas } from "./controls";
import { renderBlockBody, activateBlockEdit } from "./block-editor";
import { renderCardBlock } from "./card-block";

const ROWS = ["very-major", "major", "minor", "very-minor"] as const;
const COLS = [1, 2, 3, 4] as const;

const BASE_COLORS: Record<MatrixType, string> = {
  pain:        "hsl(0, 70%, 55%)",
  opportunity: "hsl(220, 65%, 55%)",
};

function heatLevel(row: number, col: number): "very-high" | "high" | "medium" | "low" {
  const score = (row - 1) + (col - 1);
  if (score <= 1) return "very-high";
  if (score <= 3) return "high";
  if (score <= 5) return "medium";
  return "low";
}

function rowKey(type: MatrixType, rowIdx: number): TranslationKey {
  return `matrix.row.${type}.${rowIdx + 1}` as TranslationKey;
}

function colKey(type: MatrixType, colIdx: number): TranslationKey {
  return `matrix.col.${type}.${colIdx + 1}` as TranslationKey;
}

export function renderMatrix(
  data: MatrixData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = data.type === "pain" ? "Pain Point Matrix" : "Opportunity Matrix";

  // Set base color on container so legend pills (inside header) inherit it.
  container.style.setProperty("--vzd-matrix-base", BASE_COLORS[data.type]);

  initCanvas(
    container,
    "matrix",
    defaultTitle,
    (header) => {
      // Inject legend between title and action buttons.
      const actionsDiv = header.querySelector(".vizardry-header-actions");
      const legend = header.createEl("div", { cls: "vzd-matrix-legend" });

      const levels: Array<{ key: TranslationKey; cls: string }> = [
        { key: "matrix.legend.veryHigh", cls: "vzd-matrix-legend-pill--very-high" },
        { key: "matrix.legend.high",     cls: "vzd-matrix-legend-pill--high" },
        { key: "matrix.legend.medium",   cls: "vzd-matrix-legend-pill--medium" },
        { key: "matrix.legend.low",      cls: "vzd-matrix-legend-pill--low" },
      ];
      for (const { key, cls } of levels) {
        legend.createEl("span", { cls: `vzd-matrix-legend-pill ${cls}`, text: t(key) });
      }

      if (actionsDiv) header.insertBefore(legend, actionsDiv);
    },
    source,
    undefined, // title not editable (no source write-back for title here)
    app,
  );

  const wrap = container.createEl("div", { cls: "vzd-matrix-wrap" });
  wrap.dataset.type = data.type;

  // Y-axis labels
  const yAxis = wrap.createEl("div", { cls: "vzd-matrix-y-axis" });
  ROWS.forEach((_, rowIdx) => {
    yAxis.createEl("div", { cls: "vzd-matrix-y-label", text: t(rowKey(data.type, rowIdx)) });
  });

  // 4×4 grid
  const grid = wrap.createEl("div", { cls: "vzd-matrix-grid" });
  ROWS.forEach((rowName, rowIdx) => {
    COLS.forEach((col) => {
      const blockKey = `${rowName}-${col}`;
      const heat = heatLevel(rowIdx + 1, col);
      const cell = grid.createEl("div", {
        cls: `vzd-matrix-cell vzd-matrix-cell--${heat}`,
      });
      const body = cell.createEl("div", { cls: "vizardry-block-body" });
      const content = data.data[blockKey] ?? "";
      const isCard = data.cardModes[blockKey] ?? false;

      if (isCard) {
        renderCardBlock(body, blockKey, content, app, ctx, container);
      } else {
        renderBlockBody(body, content);
        if (app && ctx) {
          body.addClass("vzd-block-editable");
          body.addEventListener("click", () =>
            activateBlockEdit(body, blockKey, content, app, ctx, container)
          );
        }
      }
    });
  });

  // X-axis labels
  const xAxis = wrap.createEl("div", { cls: "vzd-matrix-x-axis" });
  COLS.forEach((_, colIdx) => {
    xAxis.createEl("div", { cls: "vzd-matrix-x-label", text: t(colKey(data.type, colIdx)) });
  });
}
