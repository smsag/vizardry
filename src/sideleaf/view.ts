import { ItemView, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { createCard } from "./card";
import type { CardHandles } from "./card";
import type { TicketRef } from "./types";
import { cardId, parseCardId } from "./types";
import { setKeyOpen, clearAllKeyOpen } from "../shared/key-open-state";
import { UndoWindow } from "./undo";
import { enableSwipeToRemove } from "./swipe";
import { VIZARDRY_VIEW_TYPE } from "./view-type";
import { VIZARDRY_ICON_ID } from "./icon";
import type { SideleafHost } from "./view-type";
import { registerSideleafView, unregisterSideleafView } from "./index";
import { t } from "../i18n";

export { VIZARDRY_VIEW_TYPE };

interface SideleafState {
  /** Card ids, newest first — the order they are rendered in. */
  cards?: unknown;
}

/**
 * The Vizardry sideleaf: a stack of ticket cards.
 *
 * Replaces the floating popovers. A popover was anchored to the badge that
 * opened it, so it had to be positioned against the viewport, flipped to stay
 * on screen, stacked by z-index against other popovers, and torn down if its
 * badge scrolled out of the DOM. A card in a leaf has none of those problems:
 * it is ordinary flow content that outlives the note it came from.
 *
 * Cards are dismissed only by the user — their own close button, or "Clear
 * all" — and survive a restart, because the id list is persisted into the
 * leaf's workspace state. A restored card re-runs its fetch on load, which is
 * usually served straight from the summary cache.
 */
export class VizardrySideleafView extends ItemView implements SideleafHost {
  private listEl!: HTMLElement;
  private emptyEl!: HTMLElement;
  /** Card id → its handles, in insertion order (newest first in the DOM). */
  private cards = new Map<string, CardHandles>();
  private visibility: IntersectionObserver | null = null;
  private undoEl!: HTMLElement;
  /** Removals are reversible for ten seconds — see undo.ts for why only here. */
  private undo = new UndoWindow<TicketRef>(() => this.syncUndo());

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIZARDRY_VIEW_TYPE; }
  getDisplayText(): string { return t("sideleaf.title"); }
  getIcon(): string { return VIZARDRY_ICON_ID; }

  onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("vzd-sideleaf");

    const header = root.createEl("div", { cls: "vzd-sideleaf-header" });
    header.createEl("span", { cls: "vzd-sideleaf-heading", text: t("sideleaf.title") });
    const clearBtn = header.createEl("button", { cls: "vzd-sideleaf-clear", text: t("sideleaf.clearAll") });
    clearBtn.setAttribute("aria-label", t("sideleaf.clearAll"));
    clearBtn.addEventListener("click", () => this.clearAll());

    this.undoEl = root.createEl("div", { cls: "vzd-sideleaf-undo" });
    this.listEl = root.createEl("div", { cls: "vzd-sideleaf-list" });
    this.emptyEl = root.createEl("div", { cls: "vzd-sideleaf-empty" });
    const emptyIcon = this.emptyEl.createEl("div", { cls: "vzd-sideleaf-empty-icon" });
    setIcon(emptyIcon, "ticket");
    this.emptyEl.createEl("p", { text: t("sideleaf.emptyBody") });

    this.syncChrome();
    this.syncUndo();
    this.watchVisibility();
    registerSideleafView(this);
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    unregisterSideleafView(this);
    this.undo.discard();
    this.visibility?.disconnect();
    this.visibility = null;
    return Promise.resolve();
  }

  /**
   * Refreshes every card whenever the leaf becomes visible again — switching
   * back to its tab, or re-opening a collapsed sidebar.
   *
   * An IntersectionObserver rather than a workspace event: it reports what the
   * user can actually see, and covers the sidebar being collapsed, the tab
   * being switched, and the view being scrolled out, without having to model
   * each case. Refreshing is close to free inside the status TTL — the
   * service answers from its cache — so the TTL setting, not this observer,
   * decides how often the network is actually touched.
   */
  private watchVisibility(): void {
    const win = this.contentEl.ownerDocument.defaultView;
    if (!win || typeof win.IntersectionObserver !== "function") return;
    let wasVisible = false;
    this.visibility = new win.IntersectionObserver((entries) => {
      const visible = entries.some(e => e.isIntersecting);
      if (visible && !wasVisible) this.refreshAll();
      wasVisible = visible;
    });
    this.visibility.observe(this.contentEl);
  }

  /** Adds a card, or surfaces the one this key already has. */
  openCard(ref: TicketRef): void {
    const id = cardId(ref);
    const existing = this.cards.get(id);
    if (existing) {
      // Deduplicated on the key: the same ticket named in five notes is one
      // card. A repeat click surfaces it rather than stacking a copy.
      existing.el.scrollIntoView({ block: "nearest" });
      flash(existing.el);
      existing.refresh();
      return;
    }
    const card = createCard(ref, () => this.closeCard(id));
    // The fast path; the card's ⋯ menu does the same thing and is what a
    // keyboard user has. See swipe.ts for why only the sideleaf gets this.
    enableSwipeToRemove(card.el, { onRemove: () => this.closeCard(id) });
    this.cards.set(id, card);
    // Newest first, so a card opened now is where the eye already is.
    this.listEl.prepend(card.el);
    setKeyOpen(id, true);
    this.syncChrome();
  }

  closeCard(id: string): void {
    const ref = parseCardId(id);
    this.dropCard(id);
    if (ref) this.offerUndo([ref]);
    this.syncChrome();
  }

  clearAll(): void {
    // Restored newest-last so replaying through openCard rebuilds the order.
    const removed = this.cardIds().map(parseCardId).filter((r): r is TicketRef => r !== null).reverse();
    for (const id of [...this.cards.keys()]) this.dropCard(id);
    clearAllKeyOpen();
    this.offerUndo(removed);
    this.syncChrome();
  }

  /** Removes one card and its marker, with no undo bookkeeping. */
  private dropCard(id: string): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.el.remove();
    this.cards.delete(id);
    setKeyOpen(id, false);
  }

  private offerUndo(refs: TicketRef[]): void {
    this.undo.offer(refs, (items) => {
      for (const ref of items) this.openCard(ref);
      this.syncChrome();
    });
  }

  private syncUndo(): void {
    const n = this.undo.pending();
    this.undoEl.empty();
    this.undoEl.toggleClass("is-visible", n > 0);
    if (n === 0) return;
    const key = n === 1 ? "sideleaf.removed" : "sideleaf.removedPlural";
    this.undoEl.createEl("span", { text: t(key, { n: String(n) }) });
    const btn = this.undoEl.createEl("button", { cls: "vzd-sideleaf-undo-btn", text: t("sideleaf.undo") });
    btn.addEventListener("click", () => this.undo.undo());
  }

  refreshAll(): void {
    for (const card of this.cards.values()) card.refresh();
  }

  /** Card ids, in the order they are shown (newest first). */
  cardIds(): string[] {
    return [...this.cards.keys()].reverse();
  }

  private syncChrome(): void {
    const empty = this.cards.size === 0;
    this.emptyEl.toggleClass("is-visible", empty);
    this.listEl.toggleClass("is-empty", empty);
    // The card list is view state (getState below); Obsidian only writes
    // workspace.json when asked or on its own schedule, so a crash could lose
    // every card opened since. Ask for a save on each change.
    // Optional chaining: ItemView.app is wired by Obsidian, not by the test
    // harness that constructs the view directly.
    this.app?.workspace?.requestSaveLayout();
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  // Obsidian round-trips this through workspace.json, so cards survive a
  // restart — which is what "closed only by the user" has to mean across
  // sessions. Only ids are stored: the content is re-fetched on restore, and
  // a persisted summary usually answers that from cache without a request.

  getState(): Record<string, unknown> {
    return { cards: this.cardIds() };
  }

  setState(state: unknown, result: unknown): Promise<void> {
    const ids = (state as SideleafState | null)?.cards;
    if (Array.isArray(ids)) {
      // Not clearAll(): restoring a workspace is not a removal the user made,
      // so it must not leave an "Undo" offering to put back the cards that
      // were on screen a moment ago.
      for (const id of [...this.cards.keys()]) this.dropCard(id);
      this.undo.discard();
      // The list is stored newest-first, and openCard prepends — so it has to
      // be replayed oldest-first, or a restored stack comes back inverted.
      for (const id of [...ids].reverse()) {
        const ref = parseCardId(id);
        if (ref) this.openCard(ref);
      }
      this.syncChrome();
    }
    return super.setState(state, result as never);
  }
}

/** Briefly highlights a card the user asked for again. */
function flash(el: HTMLElement): void {
  el.removeClass("vzd-card--flash");
  // Force a reflow so re-adding the class restarts the animation.
  void el.offsetWidth;
  el.addClass("vzd-card--flash");
  setTimeout(() => el.removeClass("vzd-card--flash"), 700);
}
