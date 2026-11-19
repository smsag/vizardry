interface DisconnectRegistration {
  el: HTMLElement;
  cleanup: () => void;
  /** Set once `el` has been connected; a never-attached element is not cleaned. */
  seen: boolean;
}

interface DisconnectRegistry {
  mo: MutationObserver;
  regs: Set<DisconnectRegistration>;
  /** A sweep is already scheduled for this mutation burst. */
  sweepPending: boolean;
}

// One MutationObserver per document body (pop-out windows have their own),
// shared across every element watched in it — not one per element. A note with
// hundreds of enriched keys would otherwise create that many observers all
// re-running on every DOM mutation.
const registries = new WeakMap<Element, DisconnectRegistry>();

/**
 * Calls `cleanup()` once when `el` is removed from the DOM.
 *
 * Returns a dispose function — call it to cancel the watch early (e.g.
 * when setting up a replacement observer on a new container). Without
 * calling dispose, the watch stays live until `el` actually disconnects.
 *
 * Renderers register while `el` is still detached (Obsidian attaches the
 * rendered block later), so no ancestor can be resolved at registration time.
 * Instead the document body is observed with `subtree: true`, and a
 * registration only becomes eligible once `el` has been seen connected. Sweeps
 * are coalesced to one per burst via a microtask and each is a cheap
 * `isConnected` scan.
 *
 * shortcut: an element that is registered but never attached stays registered
 * until the document's registry empties; dispose it if that can happen.
 */
export function onDisconnected(el: HTMLElement, cleanup: () => void): () => void {
  const body = el.ownerDocument.body;

  let registry = registries.get(body);
  if (!registry) {
    const regs = new Set<DisconnectRegistration>();
    const created: DisconnectRegistry = { mo: null as unknown as MutationObserver, regs, sweepPending: false };
    const sweep = (): void => {
      created.sweepPending = false;
      for (const reg of Array.from(regs)) {
        if (reg.el.isConnected) { reg.seen = true; continue; }
        if (!reg.seen) continue;
        regs.delete(reg);
        try {
          reg.cleanup();
        } catch (err) {
          // One throwing cleanup must not strand the others in this sweep.
          console.warn("Vizardry: onDisconnected cleanup threw", err);
        }
      }
      if (regs.size === 0) {
        created.mo.disconnect();
        if (registries.get(body) === created) registries.delete(body);
      }
    };
    created.mo = new MutationObserver(() => {
      if (created.sweepPending) return;
      created.sweepPending = true;
      queueMicrotask(sweep);
    });
    created.mo.observe(body, { childList: true, subtree: true });
    registry = created;
    registries.set(body, registry);
  }

  const owner = registry;
  const reg: DisconnectRegistration = { el, cleanup, seen: el.isConnected };
  owner.regs.add(reg);

  return () => {
    owner.regs.delete(reg);
    if (owner.regs.size === 0) {
      owner.mo.disconnect();
      // Only drop the map entry if it is still ours: a stale dispose must not
      // orphan a newer registry (and its live observer) under the same body.
      if (registries.get(body) === owner) registries.delete(body);
    }
  };
}

/**
 * Calls `cb` once, the first time `el` intersects the viewport. A markdown
 * post processor renders into a detached element that Reading View attaches
 * later — after the first frame for a note still rendering, only when
 * scrolled to for a virtualized section — so a check that needs the element's
 * final place in the DOM (an ancestor query) can't run at render time or one
 * frame after it. Falls back to the next frame without IntersectionObserver.
 */
export function whenOnScreen(el: HTMLElement, cb: () => void): void {
  const win = el.ownerDocument.defaultView ?? window;
  if (typeof win.IntersectionObserver !== "function") {
    win.requestAnimationFrame(cb);
    return;
  }
  const io = new win.IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    cb();
  });
  io.observe(el);
}

/**
 * Returns the Window that owns `el`'s document. Obsidian pop-out windows
 * each have their own document/window pair, but the plugin's JS runs in a
 * single context whose bare `window`/`document` globals always resolve to
 * the main window — so any timer, listener, or style query that must affect
 * the window `el` is actually displayed in needs to go through this instead.
 */
export function ownerWindow(el: Node): Window {
  return el.ownerDocument?.defaultView ?? window;
}
