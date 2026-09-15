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
   * (an SVG canvas, which cannot contain an HTML button) — right-click and
   * long-press still work on the host itself.
   */
  button?: { parent: HTMLElement; cls: string };
}

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
    evt.preventDefault();
    evt.stopPropagation();
    if (Date.now() - longPressedAt < LONG_PRESS_ECHO_MS) return;
    open(evt.clientX, evt.clientY);
  });

  attachLongPress(host, (x, y) => { longPressedAt = Date.now(); open(x, y); });

  if (!opts.button) return { button: null, open };

  const btn = opts.button.parent.createEl("button", { cls: opts.button.cls });
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
