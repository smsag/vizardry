import { setIcon } from "obsidian";

/**
 * The one "add something" control every editable canvas uses (styles:
 * `.vzd-add` in styles.css), in two forms:
 *
 *   - `slot` — append to a list, column or collection: a full-width dashed row
 *     with a plus and a label naming what gets added ("Add argument").
 *   - `dot`  — insert at a point where there is no room for a row (an SCQA
 *     card's child, a SIPOC row below): a 20px circle with a plus; the label
 *     becomes its accessible name.
 *
 * Both are real buttons, revealed while the canvas is hovered or holds focus
 * (always on touch), never part of a PNG export or the presentation view.
 */
export interface AddControlOptions {
  /** What the control adds, verb first: "Add argument". */
  label: string;
  /** Default "slot". */
  variant?: "slot" | "dot";
  /** Extra class(es), for placement only — the look is shared. */
  cls?: string;
  /** Keep it visible without hover — for an empty list, where the control is
   *  the only sign there is anything to add to. */
  alwaysVisible?: boolean;
  onAdd: () => void;
}

/** Appends an add control to `parent` and returns it. Works under any
 *  element, including an SVG `foreignObject`. */
export function createAddControl(parent: Element, opts: AddControlOptions): HTMLButtonElement {
  const variant = opts.variant ?? "slot";
  const btn = parent.ownerDocument.createElement("button");
  btn.type = "button";
  btn.className = `vzd-add vzd-add--${variant}`;
  if (opts.cls) btn.classList.add(...opts.cls.split(/\s+/).filter(Boolean));
  if (opts.alwaysVisible) btn.classList.add("vzd-add--always");

  const icon = btn.appendChild(parent.ownerDocument.createElement("span"));
  icon.className = "vzd-add-icon";
  setIcon(icon, "plus");
  if (variant === "slot") {
    const label = btn.appendChild(parent.ownerDocument.createElement("span"));
    label.className = "vzd-add-label";
    label.textContent = opts.label;
  } else {
    btn.setAttribute("aria-label", opts.label);
    btn.title = opts.label;
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onAdd();
  });
  parent.appendChild(btn);
  return btn;
}
