import { activateInlineEdit } from "./inline-edit";

export interface HeaderChipOptions {
  /** Extra class on the chip, e.g. "vzd-tc-deadline". */
  cls?: string;
  label: string;
  value: string;
  /** Shown (faint, italic) in place of an empty value while editable. */
  placeholder: string;
  /** Click-to-edit handler; omit for a read-only chip. */
  onCommit?: (next: string) => void;
  /** Let an edit commit an empty value (clearing the field). Default false. */
  allowClear?: boolean;
}

/**
 * A labelled single-value chip in the canvas header, placed just before the
 * action buttons — the `period:` timeframe, Test Card's deadline, Pro /
 * Contra's decision. Click-to-edit when `onCommit` is given; renders nothing
 * when empty and read-only.
 */
export function renderHeaderChip(header: HTMLElement, opts: HeaderChipOptions): void {
  const { value, onCommit } = opts;
  if (!value && !onCommit) return;

  const field = header.createEl("div", { cls: opts.cls ? `vizardry-period ${opts.cls}` : "vizardry-period" });
  field.createEl("span", { cls: "vizardry-period-label", text: opts.label });
  const valueEl = field.createEl("span", { cls: "vizardry-period-value" });
  if (value) valueEl.setText(value);
  else { valueEl.addClass("vizardry-period-value--empty"); valueEl.setText(opts.placeholder); }

  if (onCommit) {
    valueEl.addClass("vizardry-period-value--editable");
    valueEl.addEventListener("click", (e) => {
      e.stopPropagation();
      activateInlineEdit(valueEl, value, onCommit,
        opts.allowClear ? { shouldCommit: (v, cur) => v !== cur } : {});
    });
  }

  const actions = header.querySelector(".vizardry-header-actions");
  if (actions) header.insertBefore(field, actions);
}
