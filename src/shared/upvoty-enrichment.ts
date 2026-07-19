import { getUpvotyService } from "../upvoty";
import { t } from "../i18n";
import { enrichKeys, attachKeyTrigger, buildKeyPopoverShell, formatKeyAge } from "./key-enrichment";

/**
 * Scans `container` for Upvoty post keys (e.g. UPV-1234) in text nodes and
 * replaces each match with a `.vzd-upvoty-key` button. Safe to call multiple
 * times — already-enriched keys are skipped.
 */
export function enrichUpvotyKeys(container: HTMLElement): void {
  const svc = getUpvotyService();
  if (!svc) return;
  const re = buildKeyRegex(svc.getKeyPrefix());
  enrichKeys(container, re, "vzd-upvoty-key", (doc, key) => {
    const btn = doc.createElement("button");
    btn.className = "vzd-upvoty-key";
    btn.textContent = shortenKey(key);
    btn.setAttribute("aria-label", `Upvoty: ${key}`);
    attachTrigger(btn, key);
    return btn;
  });
}

/** Shorten display text: keep prefix + first 8 chars of the ID segment + ellipsis. */
function shortenKey(key: string): string {
  const dash = key.indexOf("-");
  if (dash === -1) return key;
  const id = key.slice(dash + 1);
  if (id.length <= 10) return key;
  return key.slice(0, dash + 1 + 8) + "…";
}

export function buildKeyRegex(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Accept either a standard UUID (from the Upvoty dashboard URL ?id=…)
  // or a base62 slug (22 alphanumeric chars from the post URL after ~).
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const base62 = "[A-Za-z0-9]{10,30}";
  return new RegExp(`\\b(${escaped}-(?:${uuid}|${base62}))\\b`, "g");
}

/**
 * Renders a `.vzd-upvoty-key` badge for an explicitly-annotated key (e.g.
 * `[label](UPV-abc123...)`) — as opposed to `enrichUpvotyKeys`'s blind
 * text-node scan, this is for a key the caller already knows, attached to an
 * item whose own visible text may not contain it at all. No-ops if the
 * Upvoty integration isn't enabled, matching the same gating
 * `enrichUpvotyKeys` already applies before scanning (see main.ts).
 */
export function renderUpvotyKeyBadge(parent: HTMLElement, key: string): void {
  if (!getUpvotyService()?.isEnabled()) return;
  const btn = parent.createEl("button", { cls: "vzd-upvoty-key", text: shortenKey(key) });
  btn.setAttribute("aria-label", `Upvoty: ${key}`);
  attachTrigger(btn, key);
}

// ── Click trigger ────────────────────────────────────────────────────────────

function attachTrigger(btn: HTMLElement, key: string): void {
  attachKeyTrigger(
    btn,
    () => !!getUpvotyService()?.isEnabled(),
    (onClose) => {
      // Extract numeric/string ID from "UPV-1234" → "1234"
      const postId = key.replace(/^[^-]+-/, "");
      return buildPopover(key, postId, btn, onClose);
    },
  );
}

// ── Popover ──────────────────────────────────────────────────────────────────

function buildPopover(key: string, postId: string, anchor: HTMLElement, onClose: () => void): HTMLElement {
  const shell = buildKeyPopoverShell({
    anchor,
    previewClass: "vzd-upvoty-preview",
    keyText: shortenKey(key),
    keyAriaLabel: `Open ${key} in Upvoty`,
    loadingText: t("upvoty.loading"),
    onClose,
  });
  const { el, statusPill, keyLink, titleEl, summaryEl, footer } = shell;
  const footerEl = footer.createEl("span", { cls: "vzd-upvoty-preview-updated" });
  const votesEl = footer.createEl("span", { cls: "vzd-upvoty-preview-votes" });

  // Async fetch + AI summarize
  const svc = getUpvotyService();
  if (svc) {
    svc.getSummary(postId).then(result => {
      summaryEl.empty();

      if (!result) {
        summaryEl.createEl("span", { cls: "vzd-upvoty-preview-error", text: "Upvoty integration disabled." });
        return;
      }
      if ("error" in result) {
        summaryEl.createEl("span", { cls: "vzd-upvoty-preview-error", text: result.error });
        return;
      }

      const { post, summary } = result;

      // Upvoty's API doesn't return a public post URL, so it's built from the
      // feedback item's UUID using the dashboard's lookup pattern.
      if (post.id) keyLink.dataset.url = `${svc.getAppUrl()}?id=${post.id}`;

      if (post.status?.label) statusPill.textContent = post.status.label;

      titleEl.textContent = post.title;

      summaryEl.empty();
      if (summary) {
        summaryEl.textContent = summary;
      } else {
        summaryEl.createEl("span", { cls: "vzd-upvoty-preview-error", text: t("upvoty.noSummary") });
      }

      const parts: string[] = [];
      const aName = post.author?.name;
      if (aName) parts.push(aName);
      if (post.created_at) parts.push(formatKeyAge(post.created_at, "Created"));
      footerEl.textContent = parts.join("  ·  ");

      votesEl.textContent = t("upvoty.votes", { n: String(post.votes_count ?? 0) });
    }).catch((err: unknown) => {
      summaryEl.empty();
      summaryEl.createEl("span", { cls: "vzd-upvoty-preview-error", text: (err as Error).message ?? t("upvoty.error.network") });
    });
  }

  return el;
}
