/**
 * One way to act on an item, everywhere in Vizardry.
 *
 * Every canvas used to grow its own delete affordance: a 16px red badge in the
 * corner, hidden until hover, spelled out separately in six renderers. That
 * shape could not be made to work everywhere — it is invisible on touch, it
 * collides with the drag-to-move gesture on the card canvases, and it has no
 * equivalent at all on the SVG canvases, where there is no box to hang a
 * button off.
 *
 * What does work on all of them is a menu, reached two ways:
 *
 *   • a `⋯` button — discoverable, in the tab order, and the only route a
 *     keyboard user has;
 *   • right-click on desktop, long-press on touch — no chrome at all, for
 *     people who already expect it.
 *
 * Both open the same Obsidian `Menu`, which is the host application's own
 * idiom (file explorer, tab headers, core Canvas) and renders correctly on
 * phone and desktop without us positioning anything.
 *
 * Neither entry point takes a gesture that was already spoken for: nothing in
 * Vizardry binds right-click, and `drag-gesture.ts` deliberately leaves a
 * still press free — a drag only begins once the pointer has moved past its
 * threshold, so a press that stays put never becomes one.
 */

import { Menu, setIcon } from "obsidian";
import { createSvgEl } from "./svg";

/** How long a touch must stay still (ms) before it counts as a long press. */
export const LONG_PRESS_MS = 450;
/** Movement (px) that cancels a long press — it became a drag or a scroll. */
const LONG_PRESS_SLOP_PX = 8;

export interface ItemAction {
  title: string;
  /** Lucide icon id, or omitted for a plain row. */
  icon?: string;
  /**
   * Renders the row red. Reserve it for actions that destroy note content —
   * a canvas item's `Delete` — and leave it off for ones that only change
   * what is on screen, such as removing a card from the sideleaf.
   */
  destructive?: boolean;
  onChoose: () => void;
}

export interface ItemMenuOptions {
  /** Builds the menu fresh on each open, so item state is never stale. */
  actions: () => ItemAction[];
  /** Accessible name for the `⋯` button, e.g. `Actions for CORE-1234`. */
  label: string;
  /**
   * Where the `⋯` button goes. Omit for a host that supplies its own trigger
   * (an SVG canvas uses `attachSvgItemMenu` instead) — right-click and
   * long-press still work on the host itself.
   *
   * The button is always a direct child of `parent`, and is revealed by
   * hovering `parent` — so pass the item itself, not a wrapper around several.
   * `placement` picks the one of two positions every canvas uses: the top-right
   * corner of a card or box, or vertically centred at the end of a text row.
   * `cls` is only a hook for per-canvas tweaks; the look is shared.
   */
  button?: { parent: HTMLElement; cls: string; placement?: ItemMenuPlacement };
}

export type ItemMenuPlacement = "corner" | "row";

/** The class every `⋯` trigger carries, HTML and SVG alike. */
export const ITEM_MENU_CLS = "vzd-item-menu";
/** Marks an item that owns a trigger; hovering it reveals its own `⋯`. */
export const ITEM_HOST_CLS = "vzd-item-host";

function buildMenu(actions: ItemAction[]): Menu {
  const menu = new Menu();
  for (const action of actions) {
    menu.addItem((item) => {
      item.setTitle(action.title);
      if (action.icon) item.setIcon(action.icon);
      // Obsidian paints a warning item in the theme's own red, so this tracks
      // the vault's palette rather than hard-coding a colour.
      if (action.destructive) item.setWarning(true);
      item.onClick(() => action.onChoose());
    });
  }
  return menu;
}

export interface ItemMenuHandle {
  /** The `⋯` button, when one was requested; null for a self-triggered host. */
  button: HTMLElement | null;
  /** Opens the menu at viewport coordinates — for a caller's own trigger. */
  open: (x: number, y: number) => void;
}

/**
 * Wires `host` for the actions menu.
 *
 * `host` may be an HTMLElement or an SVG element — the listeners are the same
 * either way, which is what lets the Fishbone, Mind Map and Nodemap canvases
 * share this with the card canvases. An SVG host cannot contain an HTML
 * button, so it omits `button` and drives `open()` from its own SVG trigger.
 */
export function attachItemMenu(host: Element, opts: ItemMenuOptions): ItemMenuHandle {
  host.classList.add(ITEM_HOST_CLS);
  const open = (x: number, y: number): void => {
    const actions = opts.actions();
    if (actions.length === 0) return;
    buildMenu(actions).showAtPosition({ x, y }, host.ownerDocument);
  };

  // Android also fires a native contextmenu for the same long press that the
  // pointer timer already answered; that one must not open a second menu.
  let longPressedAt = 0;
  host.addEventListener("contextmenu", (e) => {
    const evt = e as MouseEvent;
    // A nested host (an OST bullet inside its node) answered first; the
    // outer item must not open its own menu on top.
    if (evt.defaultPrevented) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (Date.now() - longPressedAt < LONG_PRESS_ECHO_MS) return;
    open(evt.clientX, evt.clientY);
  });

  attachLongPress(host, (x, y) => { longPressedAt = Date.now(); open(x, y); });

  if (!opts.button) return { button: null, open };

  const placement = opts.button.placement === "row" ? "vzd-item-menu--row" : "vzd-item-menu--corner";
  const btn = opts.button.parent.createEl("button", {
    cls: `${ITEM_MENU_CLS} ${placement} ${opts.button.cls}`,
  });
  btn.setAttribute("type", "button");
  btn.setAttribute("aria-label", opts.label);
  btn.setAttribute("aria-haspopup", "menu");
  setIcon(btn, "more-horizontal");
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Anchored to the button, not the pointer, so a keyboard activation (which
    // reports 0,0) still opens the menu next to the control.
    const rect = btn.getBoundingClientRect();
    open(rect.left, rect.bottom);
  });
  return { button: btn, open };
}

export interface SvgItemMenuOptions extends Omit<ItemMenuOptions, "button"> {
  /** Centre of the trigger, in the host's own coordinates. */
  x: number;
  y: number;
  /** Extra class — a hook for per-canvas tweaks, as `button.cls` is. */
  cls?: string;
  /**
   * Gives the trigger an opaque disc, for one that sits on a line (a link's
   * midpoint) rather than inside a filled box.
   */
  floating?: boolean;
}

export interface SvgItemMenuHandle extends ItemMenuHandle {
  /** The drawn trigger — e.g. to anchor a popover a menu row opens. */
  trigger: SVGGElement;
  /** Moves the trigger, e.g. after its box was dragged. */
  moveTo: (x: number, y: number) => void;
}

/** Side of the trigger's visible square, and of its (larger) hit area. */
const SVG_TRIGGER_SIZE = 20;
const SVG_TRIGGER_HIT = 24;

/**
 * The SVG counterpart of the `⋯` button: same size, same look, same reveal,
 * for the canvases drawn in SVG (Mind Map, OST, Fishbone, Nodemap, Wardley).
 * An `<svg>` cannot contain an HTML `<button>`, so this draws one — a rounded
 * square with three dots — and gives it the button semantics by hand.
 *
 * The trigger is appended to `host` as a direct child, so hovering the item
 * reveals exactly its own trigger and not a nested item's.
 */
export function attachSvgItemMenu(host: SVGGElement, opts: SvgItemMenuOptions): SvgItemMenuHandle {
  const handle = attachItemMenu(host, { actions: opts.actions, label: opts.label });

  const cls = [ITEM_MENU_CLS, "vzd-item-menu--svg"];
  if (opts.floating) cls.push("vzd-item-menu--floating");
  if (opts.cls) cls.push(opts.cls);
  const g = createSvgEl("g", {
    class: cls.join(" "),
    role: "button",
    tabindex: "0",
    "aria-label": opts.label,
    "aria-haspopup": "menu",
  }) as SVGGElement;
  const half = SVG_TRIGGER_HIT / 2;
  g.appendChild(createSvgEl("rect", {
    x: String(-half), y: String(-half), width: String(SVG_TRIGGER_HIT), height: String(SVG_TRIGGER_HIT),
    class: "vzd-item-menu-hit",
  }));
  const s = SVG_TRIGGER_SIZE / 2;
  g.appendChild(createSvgEl("rect", {
    x: String(-s), y: String(-s), width: String(SVG_TRIGGER_SIZE), height: String(SVG_TRIGGER_SIZE),
    rx: "4", class: "vzd-item-menu-bg",
  }));
  for (const dx of [-5, 0, 5]) {
    g.appendChild(createSvgEl("circle", { cx: String(dx), cy: "0", r: "1.5", class: "vzd-item-menu-dot" }));
  }

  const moveTo = (x: number, y: number): void => g.setAttribute("transform", `translate(${x}, ${y})`);
  moveTo(opts.x, opts.y);

  const openFromTrigger = (): void => {
    const r = g.getBoundingClientRect();
    handle.open(r.left, r.bottom);
  };
  // A press on the trigger is a click, never the start of dragging its item.
  g.addEventListener("pointerdown", (e) => e.stopPropagation());
  g.addEventListener("click", (e) => { e.stopPropagation(); openFromTrigger(); });
  g.addEventListener("keydown", (e) => {
    const evt = e as KeyboardEvent;
    if (evt.key !== "Enter" && evt.key !== " ") return;
    evt.preventDefault();
    evt.stopPropagation();
    openFromTrigger();
  });
  host.appendChild(g);
  return { button: null, open: handle.open, trigger: g, moveTo };
}

/**
 * Long press on touch only.
 *
 * Bound to `pointer*` rather than `touch*` so it sees the same stream the drag
 * gesture does, and gated on `pointerType === "touch"` so a mouse press never
 * arms it — on desktop the same job belongs to right-click, and a mouse user
 * holding still over a card should not get a menu they did not ask for.
 *
 * Any movement past a few pixels cancels: at that point the press is a drag or
 * a scroll, and both of those already mean something on these canvases.
 */
/** How long after a long press a native contextmenu still counts as its echo. */
const LONG_PRESS_ECHO_MS = 700;

/** Pointer events a host has already armed a long press for. */
const armedBy = new WeakSet<Event>();

function attachLongPress(host: Element, open: (x: number, y: number) => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  const cancel = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  host.addEventListener("pointerdown", (e) => {
    const evt = e as PointerEvent;
    if (evt.pointerType !== "touch") return;
    // Only the innermost host arms: a long press on an OST bullet is the
    // bullet's, not also its node's.
    if (armedBy.has(evt)) return;
    armedBy.add(evt);
    startX = evt.clientX;
    startY = evt.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      open(startX, startY);
    }, LONG_PRESS_MS);
  });

  host.addEventListener("pointermove", (e) => {
    const evt = e as PointerEvent;
    if (timer === null) return;
    if (Math.abs(evt.clientX - startX) > LONG_PRESS_SLOP_PX
      || Math.abs(evt.clientY - startY) > LONG_PRESS_SLOP_PX) cancel();
  });

  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    host.addEventListener(type, cancel);
  }
}
