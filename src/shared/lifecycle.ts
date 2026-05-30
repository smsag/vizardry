/**
 * Calls `cleanup()` once when `el` is removed from the DOM.
 *
 * Observes only the immediate parent (not document.body with subtree:true)
 * so the MutationObserver fires only when the parent's direct children change,
 * not on every DOM mutation in the entire document.
 *
 * Use this anywhere a renderer needs to release resources (event listeners,
 * ResizeObservers, MediaQueryList listeners) when its root element is removed.
 */
export function onDisconnected(el: HTMLElement, cleanup: () => void): void {
  const parent = el.closest(".workspace-leaf-content") ?? el.parentElement ?? document.body;
  const mo = new MutationObserver(() => {
    if (!el.isConnected) {
      cleanup();
      mo.disconnect();
    }
  });
  mo.observe(parent, { childList: true });
}
