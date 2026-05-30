/**
 * Calls `cleanup()` once when `el` is removed from the DOM, then
 * disconnects the internal observer automatically.
 *
 * Returns a dispose function — call it to cancel the watch early (e.g.
 * when setting up a replacement observer on a new container). Without
 * calling dispose, the observer stays live until `el` actually disconnects.
 *
 * Observes only the nearest .workspace-leaf-content ancestor (not
 * document.body with subtree:true) so it fires only when the parent's
 * direct children change, not on every DOM mutation in the document.
 */
export function onDisconnected(el: HTMLElement, cleanup: () => void): () => void {
  const parent = el.closest(".workspace-leaf-content") ?? el.parentElement ?? document.body;
  const mo = new MutationObserver(() => {
    if (!el.isConnected) {
      cleanup();
      mo.disconnect();
    }
  });
  mo.observe(parent, { childList: true });
  return () => mo.disconnect();
}
