interface DisconnectRegistration {
  el: HTMLElement;
  cleanup: () => void;
}

interface DisconnectRegistry {
  mo: MutationObserver;
  regs: Set<DisconnectRegistration>;
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
 * Observes only the nearest .workspace-leaf-content ancestor (not
 * document.body with subtree:true) so it fires only when the parent's
 * direct children change, not on every DOM mutation in the document.
 */
export function onDisconnected(el: HTMLElement, cleanup: () => void): () => void {
  const parent = el.closest(".workspace-leaf-content") ?? el.parentElement ?? document.body;

  let registry = registries.get(parent);
  if (!registry) {
    const regs = new Set<DisconnectRegistration>();
    const mo = new MutationObserver(() => {
      for (const reg of Array.from(regs)) {
        if (!reg.el.isConnected) {
          regs.delete(reg);
          reg.cleanup();
        }
      }
      if (regs.size === 0) {
        mo.disconnect();
        registries.delete(parent);
      }
    });
    mo.observe(parent, { childList: true });
    registry = { mo, regs };
    registries.set(parent, registry);
  }

  const reg: DisconnectRegistration = { el, cleanup };
  registry.regs.add(reg);

  return () => {
    registry!.regs.delete(reg);
    if (registry!.regs.size === 0) {
      registry!.mo.disconnect();
      registries.delete(parent);
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
