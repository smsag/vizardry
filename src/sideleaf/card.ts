/**
 * One ticket card in the Vizardry sideleaf.
 *
 * The card carries the same visual language the popover ended on — the status
 * as an underlined eyebrow in the state's own colour, then the key link,
 * title, summary and a meta footer. What changed is the container: a card
 * lives in the leaf's flow at the leaf's own width, so none of the popover's
 * fixed positioning, viewport flipping or z-index stacking is needed.
 *
 * Linear and Upvoty differ only in which fields they have (Upvoty adds a vote
 * count, Linear an assignee), so the shell is shared and each service supplies
 * a loader that fills it.
 */

import { getLinearService } from "../linear";
import { getUpvotyService } from "../upvoty";
import { setStatusColor, formatKeyAge } from "../shared/key-format";
import { t } from "../i18n";
import { attachItemMenu } from "../shared/item-menu";
import type { TicketRef } from "./types";
import { cardId } from "./types";

export interface CardHandles {
  /** The card's root element, for insertion and for scroll-into-view. */
  el: HTMLElement;
  /** Re-runs the fetch. Cheap inside the status TTL — the service caches. */
  refresh: () => void;
}

interface CardShell {
  statusEl: HTMLElement;
  keyLink: HTMLAnchorElement;
  titleEl: HTMLElement;
  summaryEl: HTMLElement;
  metaEl: HTMLElement;
  extraEl: HTMLElement;
}

/** Display text for a key: Upvoty ids are long base62/UUID strings. */
function shortenKey(key: string): string {
  const dash = key.indexOf("-");
  if (dash === -1 || key.length - dash - 1 <= 10) return key;
  return key.slice(0, dash + 1 + 8) + "…";
}

/**
 * Builds one card and starts its first load.
 *
 * `onClose` is wired to the card's own close button — a card is only ever
 * dismissed by the user, either here or through the leaf's "Clear all".
 */
export function createCard(ref: TicketRef, onClose: () => void): CardHandles {
  const el = document.createElement("div");
  el.className = "vzd-card";
  el.dataset.cardId = cardId(ref);
  el.setAttribute("role", "article");


  const header = el.createEl("div", { cls: "vzd-card-header" });
  const statusEl = header.createEl("span", { cls: "vzd-card-status" });
  const keyLink = header.createEl("a", {
    cls: "vzd-card-key",
    text: ref.service === "upvoty" ? shortenKey(ref.key) : ref.key,
  }) as HTMLAnchorElement;
  keyLink.setAttribute("href", "#");
  keyLink.setAttribute("aria-label", t("sideleaf.openExternal", { key: ref.key }));
  keyLink.addEventListener("click", (e) => {
    e.preventDefault();
    const url = keyLink.dataset.url;
    if (url) window.open(url, "_blank", "noopener");
  });

  const titleEl = el.createEl("div", { cls: "vzd-card-title" });
  const summaryEl = el.createEl("p", { cls: "vzd-card-summary" });
  const footer = el.createEl("div", { cls: "vzd-card-footer" });
  const metaEl = footer.createEl("span", { cls: "vzd-card-meta" });
  const extraEl = footer.createEl("span", { cls: "vzd-card-extra" });

  const shell: CardShell = { statusEl, keyLink, titleEl, summaryEl, metaEl, extraEl };

  // One load at a time: a refresh arriving while the first fetch is still out
  // would race it, and the later response is not necessarily the newer one.
  let loading = false;
  const refresh = (): void => {
    if (loading) return;
    loading = true;
    el.addClass("vzd-card--loading");
    const done = (): void => { loading = false; el.removeClass("vzd-card--loading"); };
    const load = ref.service === "linear" ? loadLinearCard : loadUpvotyCard;
    load(shell, ref.key).then(done, (err: unknown) => {
      done();
      showError(shell, (err as Error)?.message ?? t("upvoty.error.network"));
    });
  };

  // The same actions menu every canvas item uses. "Remove card" is not marked
  // destructive: it takes the card off this panel and changes nothing in the
  // vault — clicking the key again brings it straight back.
  attachItemMenu(el, {
    label: t("menu.actionsFor", { name: ref.key }),
    button: { parent: el, cls: "vzd-card-menu vzd-btn" },
    actions: () => [
      { title: t("sideleaf.refresh"), icon: "refresh-cw", onChoose: refresh },
      { title: t("sideleaf.copyKey"), icon: "copy", onChoose: () => void navigator.clipboard?.writeText(ref.key) },
      { title: t("sideleaf.removeCard"), icon: "x", onChoose: onClose },
    ],
  });

  summaryEl.createEl("span", { cls: "vzd-card-loading", text: t("roadmap.linear.loading") });
  refresh();

  return { el, refresh };
}

function showError(shell: CardShell, message: string): void {
  shell.summaryEl.empty();
  shell.summaryEl.createEl("span", { cls: "vzd-card-error", text: message });
}

async function loadLinearCard(shell: CardShell, key: string): Promise<void> {
  const svc = getLinearService();
  if (!svc) { showError(shell, t("sideleaf.linearDisabled")); return; }

  const result = await svc.getSummary(key);
  shell.summaryEl.empty();

  if (!result) { showError(shell, t("sideleaf.linearDisabled")); return; }
  if ("error" in result) { showError(shell, result.error); return; }

  shell.statusEl.textContent = result.state.name;
  setStatusColor(shell.statusEl, result.state.color);
  if (result.url) shell.keyLink.dataset.url = result.url;
  shell.titleEl.textContent = result.title;

  if (result.summary) shell.summaryEl.textContent = result.summary;
  else shell.summaryEl.createEl("span", { cls: "vzd-card-error", text: t("roadmap.linear.noSummary") });

  const assignee = result.assignee ?? t("roadmap.linear.unassigned");
  const age = result.updatedAt ? formatKeyAge(result.updatedAt, "Updated") : "";
  shell.metaEl.textContent = age ? `${assignee}  ·  ${age}` : assignee;
}

async function loadUpvotyCard(shell: CardShell, key: string): Promise<void> {
  const svc = getUpvotyService();
  if (!svc) { showError(shell, t("sideleaf.upvotyDisabled")); return; }

  // The badge text carries the prefix ("UPV-<id>"); the service wants the id.
  const postId = key.replace(/^[^-]+-/, "");
  const result = await svc.getSummary(postId);
  shell.summaryEl.empty();

  if (!result) { showError(shell, t("sideleaf.upvotyDisabled")); return; }
  if ("error" in result) { showError(shell, result.error); return; }

  const { post, summary } = result;
  if (post.id) shell.keyLink.dataset.url = `${svc.getAppUrl()}?id=${post.id}`;
  if (post.status?.label) {
    shell.statusEl.textContent = post.status.label;
    setStatusColor(shell.statusEl, post.status.color);
  }
  shell.titleEl.textContent = post.title;

  if (summary) shell.summaryEl.textContent = summary;
  else shell.summaryEl.createEl("span", { cls: "vzd-card-error", text: t("upvoty.noSummary") });

  const parts: string[] = [];
  if (post.author?.name) parts.push(post.author.name);
  if (post.created_at) parts.push(formatKeyAge(post.created_at, "Created"));
  shell.metaEl.textContent = parts.join("  ·  ");
  shell.extraEl.textContent = t("upvoty.votes", { n: String(post.votes_count ?? 0) });
}
