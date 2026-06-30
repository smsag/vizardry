import { setIcon } from "obsidian";
import { getUpvotyService } from "../upvoty";
import { t } from "../i18n";
import { onDisconnected } from "./lifecycle";

const SKIP_TAGS = new Set(["PRE", "INPUT", "TEXTAREA", "SCRIPT", "STYLE"]);

// ── Open popovers ────────────────────────────────────────────────────────────

const openPopovers = new Map<HTMLElement, HTMLElement>();
let topZIndex = 2000;

function closePopover(anchor: HTMLElement): void {
  const popover = openPopovers.get(anchor);
  if (popover) {
    popover.remove();
    openPopovers.delete(anchor);
  }
}

function bringToFront(popover: HTMLElement): void {
  topZIndex += 1;
  popover.style.zIndex = String(topZIndex);
}

// ── Time formatting ──────────────────────────────────────────────────────────

function formatAge(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1)  return "Updated just now";
  if (diffH < 24) return `Updated ${diffH}h ago`;
  return `Updated ${Math.floor(diffH / 24)}d ago`;
}


// ── DOM walking ──────────────────────────────────────────────────────────────

/**
 * Scans `container` for Upvoty post keys (e.g. UPV-1234) in text nodes and
 * replaces each match with a `.vzd-upvoty-key` button. Safe to call multiple
 * times — already-enriched keys are skipped.
 */
export function enrichUpvotyKeys(container: HTMLElement): void {
  const svc = getUpvotyService();
  if (!svc) return;
  const re = buildKeyRegex(svc.getKeyPrefix());
  const nodes: Text[] = [];
  collectTextNodes(container, nodes, re);
  for (const node of nodes) wrapTextNode(node, re);
}

export function buildKeyRegex(prefix: string): RegExp {
  // Escape the prefix in case it contains regex special chars, then match the
  // base62 post ID (e.g. 5OdEIWLP5WQ1B2z7TnjE1o — alphanumeric, 10-30 chars)
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(${escaped}-[A-Za-z0-9]{10,30})\\b`, "g");
}

function collectTextNodes(node: Node, re: RegExp, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    re.lastIndex = 0;
    if (re.test(node.textContent ?? "")) out.push(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (el.classList.contains("vzd-upvoty-key")) return;
  for (const child of Array.from(el.childNodes)) collectTextNodes(child, re, out);
}

function wrapTextNode(node: Text, re: RegExp): void {
  const text = node.textContent ?? "";
  const parent = node.parentNode;
  if (!parent) return;

  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  re.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const btn = document.createElement("button");
    btn.className = "vzd-upvoty-key";
    btn.textContent = match[1];
    btn.setAttribute("aria-label", `Upvoty: ${match[1]}`);
    attachTrigger(btn, match[1]);
    frag.appendChild(btn);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return;
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  parent.replaceChild(frag, node);
}

// ── Click trigger ────────────────────────────────────────────────────────────

function attachTrigger(btn: HTMLElement, key: string): void {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const existing = openPopovers.get(btn);
    if (existing) { bringToFront(existing); return; }
    if (!getUpvotyService()?.isEnabled()) return;
    // Extract numeric/string ID from "UPV-1234" → "1234"
    const postId = key.replace(/^[^-]+-/, "");
    const popover = buildPopover(key, postId, btn, () => closePopover(btn));
    document.body.appendChild(popover);
    bringToFront(popover);
    openPopovers.set(btn, popover);
  });

  onDisconnected(btn, () => closePopover(btn));
}

// ── Popover ──────────────────────────────────────────────────────────────────

function buildPopover(key: string, postId: string, anchor: HTMLElement, onClose: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "vzd-upvoty-preview";
  el.addEventListener("mousedown", () => bringToFront(el));

  // Position: below-right of anchor, flip as needed
  const rect = anchor.getBoundingClientRect();
  const width = 320;
  let left = rect.right + 8;
  if (left + width > window.innerWidth - 8) left = rect.left - width - 8;
  let top = rect.bottom + 4;
  if (top + 240 > window.innerHeight - 8) top = rect.top - 244;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top  = `${Math.max(8, top)}px`;

  // Close button
  const closeBtn = el.createEl("button", { cls: "vzd-upvoty-preview-close vzd-btn" });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); onClose(); });

  // Header: [status pill]  [votes]  [key link]
  const header = el.createEl("div", { cls: "vzd-upvoty-preview-header" });
  const statusPill = header.createEl("span", { cls: "vzd-upvoty-preview-status" });
  const votesEl = header.createEl("span", { cls: "vzd-upvoty-preview-votes" });
  const keyLink = header.createEl("a", { cls: "vzd-upvoty-preview-key", text: key });
  keyLink.setAttribute("href", "#");
  keyLink.setAttribute("aria-label", `Open ${key} in Upvoty`);
  keyLink.addEventListener("click", (e) => {
    e.preventDefault();
    const url = keyLink.dataset.url;
    if (url) window.open(url, "_blank", "noopener");
  });

  // Title
  const titleEl = el.createEl("div", { cls: "vzd-upvoty-preview-title" });

  // Summary body
  const body = el.createEl("div", { cls: "vzd-upvoty-preview-body" });
  const summaryEl = body.createEl("p", { cls: "vzd-upvoty-preview-summary" });
  summaryEl.createEl("span", { cls: "vzd-upvoty-preview-loading", text: t("upvoty.loading") });

  // Footer
  const footer = el.createEl("div", { cls: "vzd-upvoty-preview-footer" });
  const footerEl = footer.createEl("span", { cls: "vzd-upvoty-preview-updated" });

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

      const label = post.status?.label;
      if (label) statusPill.textContent = label;

      votesEl.textContent = t("upvoty.votes", { n: String(post.votes_count ?? 0) });

      titleEl.textContent = post.title;

      if (summary) {
        summaryEl.textContent = summary;
      } else {
        summaryEl.createEl("span", { cls: "vzd-upvoty-preview-error", text: t("upvoty.noSummary") });
      }

      const parts: string[] = [];
      const aName = post.author?.name;
      if (aName) parts.push(`by ${aName}`);
      if (post.updated_at) parts.push(formatAge(post.updated_at));
      footerEl.textContent = parts.join("  ·  ");
    }).catch((err: unknown) => {
      summaryEl.empty();
      summaryEl.createEl("span", { cls: "vzd-upvoty-preview-error", text: (err as Error).message ?? t("upvoty.error.network") });
    });
  }

  return el;
}
