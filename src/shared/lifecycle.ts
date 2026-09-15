interface DisconnectRegistration {
  el: HTMLElement;
  cleanup: () => void;
}

interface DisconnectRegistry {
  mo: MutationObserver;
  regs: Set<DisconnectRegistration>;
  /** A sweep is already scheduled for this mutation burst. */
  sweepPending: boolean;
}

// One MutationObserver per watched ancestor, shared across every element
// watched under it — not one per element. A note with dozens/hundreds of
// enriched Linear/Upvoty keys previously created that many independent
// observers all watching the same .workspace-leaf-content, each re-running
// on every DOM mutation of that ancestor. Keyed by the resolved ancestor, not
// `el`, so unrelated onDisconnected() calls under the same ancestor share
// the cost of detecting mutations; each still gets its own independent
// cleanup callback and dispose handle.
const registries = new WeakMap<Element, DisconnectRegistry>();

/**
 * Calls `cleanup()` once when `el` is removed from the DOM.
 *
 * Returns a dispose function — call it to cancel the watch early (e.g.
 * when setting up a replacement observer on a new container). Without
 * calling dispose, the watch stays live until `el` actually disconnects.
 *
 * Observes the nearest .workspace-leaf-content ancestor (not document.body)
 * with `subtree: true`: a canvas sits many levels below the leaf root, and
 * the mutation that removes it — a re-render of the preview section, a
 * different note opening in the same leaf — never touches the leaf's direct
 * children. Watching only `childList` on the root meant cleanups practically
 * never fired and every registration leaked. The subtree observer sees far
 * more mutations (every keystroke in the editor), so sweeps are coalesced
 * to one per burst via a microtask and each is a cheap `isConnected` scan.
 */
export function onDisconnected(el: HTMLElement, cleanup: () => void): () => void {
  const parent = el.closest(".workspace-leaf-content") ?? el.parentElement ?? document.body;

  let registry = registries.get(parent);
  if (!registry) {
    const regs = new Set<DisconnectRegistration>();
    const created: DisconnectRegistry = { mo: null as unknown as MutationObserver, regs, sweepPending: false };
    const sweep = (): void => {
      created.sweepPending = false;
      for (const reg of Array.from(regs)) {
        if (reg.el.isConnected) continue;
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
        if (registries.get(parent) === created) registries.delete(parent);
      }
    };
    created.mo = new MutationObserver(() => {
      if (created.sweepPending) return;
      created.sweepPending = true;
      queueMicrotask(sweep);
    });
    created.mo.observe(parent, { childList: true, subtree: true });
    registry = created;
    registries.set(parent, registry);
  }

  const owner = registry;
  const reg: DisconnectRegistration = { el, cleanup };
  owner.regs.add(reg);

  return () => {
    owner.regs.delete(reg);
    if (owner.regs.size === 0) {
      owner.mo.disconnect();
      // Only drop the map entry if it is still ours: a stale dispose must not
      // orphan a newer registry (and its live observer) under the same parent.
      if (registries.get(parent) === owner) registries.delete(parent);
    }
  };
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
