/**
 * Tracks which keys currently have a card in the sideleaf, and keeps every
 * badge for those keys marked accordingly.
 *
 * A key is not a single element: CORE-1234 can appear in five notes and twice
 * more inside a canvas, and all of those badges refer to one card. So the
 * marker is held per *key*, and every badge registered under that key is
 * updated together — previously the open state was held per anchor element,
 * which only ever made sense while a popover belonged to the badge that
 * spawned it.
 *
 * Badges unregister themselves when they leave the DOM (see attachKeyTrigger
 * and lifecycle.onDisconnected), so re-rendering a note does not leak
 * elements. The registry itself is a plain Map, so that unregistration is
 * what keeps it bounded.
 */

/** Class marking a badge whose key has a card in the leaf. */
export const KEY_OPEN_CLASS = "vzd-key--open";

const badges = new Map<string, Set<HTMLElement>>();
const openIds = new Set<string>();

function apply(btn: HTMLElement, open: boolean): void {
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle(KEY_OPEN_CLASS, open);
}

/** Registers a badge as referring to `id`, adopting the current open state. */
export function registerKeyBadge(id: string, btn: HTMLElement): void {
  let set = badges.get(id);
  if (!set) { set = new Set(); badges.set(id, set); }
  set.add(btn);
  apply(btn, openIds.has(id));
}

/** Drops a badge from the registry — call when it leaves the DOM. */
export function unregisterKeyBadge(id: string, btn: HTMLElement): void {
  const set = badges.get(id);
  if (!set) return;
  set.delete(btn);
  if (set.size === 0) badges.delete(id);
}

/** Marks every badge for `id` open or closed. */
export function setKeyOpen(id: string, open: boolean): void {
  if (open) openIds.add(id);
  else openIds.delete(id);
  for (const btn of badges.get(id) ?? []) apply(btn, open);
}

/** Clears the open marker from every key at once (the leaf's "Clear all"). */
export function clearAllKeyOpen(): void {
  for (const id of [...openIds]) setKeyOpen(id, false);
}

/** True when `id` currently has a card. */
export function isKeyOpen(id: string): boolean {
  return openIds.has(id);
}

/** @internal Test seam — drops all registrations and open marks. */
export function resetKeyOpenState(): void {
  badges.clear();
  openIds.clear();
}
