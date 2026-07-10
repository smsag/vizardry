import { setIcon } from "obsidian";
import { getLinearService } from "../linear";
import { t } from "../i18n";
import { onDisconnected } from "./lifecycle";

// Matches LINEAR-style identifiers like CORE-1234, PSINT-42, ENG-9999
const LINEAR_KEY_RE = /\b([A-Z]{2,10}-\d+)\b/g;

// Tags whose content should never be enriched.
// PRE skips multi-line code blocks (and their CODE children). Inline CODE is
// intentionally kept so `CORE-1234` enriches normally. A is skipped because
// wrapping a match in a <button> would nest interactive content inside a
// link — invalid HTML that produces inconsistent click/focus behaviour.
const SKIP_TAGS = new Set(["PRE", "INPUT", "TEXTAREA", "SCRIPT", "STYLE", "A"]);

// ── Open popovers ────────────────────────────────────────────────────────────
// Multiple popovers can be open at once, one per trigger element. Each is only
// closed by an explicit click on its own close icon (or its trigger leaving
// the DOM) — never auto-closed by opening another one.

const openPopovers = new Map<HTMLElement, HTMLElement>();
let topZIndex = 1000;

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

// ── Colour contrast ──────────────────────────────────────────────────────────

/**
 * Linear issue-state colours span the whole lightness range (pale grey for
 * Backlog, pale yellow for Todo, saturated greens/reds for done/cancelled).
 * A fixed white label text is unreadable against the lighter ones, so pick
 * black or white per-colour using WCAG relative luminance.
 */
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
 * Scans `container` for Linear issue keys in text nodes and replaces each
 * match with a `.vzd-linear-key` button that fetches and previews the issue
 * when clicked. Safe to call multiple times — already-enriched keys are
 * skipped.
 */
export function enrichLinearKeys(container: HTMLElement): void {
  const nodes: Text[] = [];
  collectTextNodes(container, nodes);
  for (const node of nodes) wrapTextNode(node);
}

function collectTextNodes(node: Node, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    LINEAR_KEY_RE.lastIndex = 0;
    if (LINEAR_KEY_RE.test(node.textContent ?? "")) out.push(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (el.classList.contains("vzd-linear-key")) return; // already enriched
  for (const child of Array.from(el.childNodes)) collectTextNodes(child, out);
}

function wrapTextNode(node: Text): void {
  const text = node.textContent ?? "";
  const parent = node.parentNode;
  if (!parent) return;

  const doc = node.ownerDocument;
  const frag = doc.createDocumentFragment();
  let lastIndex = 0;
  LINEAR_KEY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINEAR_KEY_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
    }

    // Key badge — itself the trigger that requests the Linear data fetch
    const btn = doc.createElement("button");
    btn.className = "vzd-linear-key";
    btn.textContent = match[1];
    btn.setAttribute("aria-label", `Linear: ${match[1]}`);
    attachTrigger(btn, match[1]);
    frag.appendChild(btn);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return;
  if (lastIndex < text.length) {
    frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
  }
  parent.replaceChild(frag, node);
}

// ── Click trigger ────────────────────────────────────────────────────────────

function attachTrigger(btn: HTMLElement, key: string): void {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Already open for this exact key instance — bring it to front instead
    // of opening a duplicate.
    const existing = openPopovers.get(btn);
    if (existing) { bringToFront(existing); return; }
    if (!getLinearService()?.isEnabled()) return;
    const popover = buildPopover(key, btn, () => closePopover(btn));
    btn.ownerDocument.body.appendChild(popover);
    bringToFront(popover);
    openPopovers.set(btn, popover);
  });

  // Clean up if this button leaves the DOM while its popover is open
  onDisconnected(btn, () => closePopover(btn));
}

// ── Popover ──────────────────────────────────────────────────────────────────

function buildPopover(key: string, anchor: HTMLElement, onClose: () => void): HTMLElement {
  const win = anchor.ownerDocument.defaultView ?? window;
  const el = anchor.ownerDocument.createElement("div");
  el.className = "vzd-linear-preview";
  el.addEventListener("mousedown", () => bringToFront(el));

  // Position: below-right of anchor, flip as needed
  const rect = anchor.getBoundingClientRect();
  const width = 320;
  let left = rect.right + 8;
  if (left + width > win.innerWidth - 8) left = rect.left - width - 8;
  let top = rect.bottom + 4;
  if (top + 240 > win.innerHeight - 8) top = rect.top - 244;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top  = `${Math.max(8, top)}px`;

  // Close button — top-right corner; this is the only way to dismiss the
  // popover (no auto-close, no click-outside — the user must act on it).
  const closeBtn = el.createEl("button", { cls: "vzd-linear-preview-close vzd-btn" });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); onClose(); });

  // Header: [status pill]  [key — clickable, opens Linear URL]
  const header = el.createEl("div", { cls: "vzd-linear-preview-header" });
  const statusPill = header.createEl("span", { cls: "vzd-linear-preview-status" });
  const keyLink = header.createEl("a", { cls: "vzd-linear-preview-key", text: key });
  keyLink.setAttribute("href", "#");
  keyLink.setAttribute("aria-label", `Open ${key} in Linear`);
  keyLink.addEventListener("click", (e) => {
    e.preventDefault();
    const url = keyLink.dataset.url;
    if (url) win.open(url, "_blank", "noopener");
  });

  // Issue title (populated async)
  const titleEl = el.createEl("div", { cls: "vzd-linear-preview-title" });

  // Summary body
  const body = el.createEl("div", { cls: "vzd-linear-preview-body" });
  const summaryEl = body.createEl("p", { cls: "vzd-linear-preview-summary" });
  summaryEl.createEl("span", { cls: "vzd-linear-preview-loading", text: t("roadmap.linear.loading") });

  // Footer: "Jane Doe  |  3d ago"
  const footer = el.createEl("div", { cls: "vzd-linear-preview-footer" });
  const footerEl = footer.createEl("span", { cls: "vzd-linear-preview-updated" });

  // Async fetch — fires immediately on open
  const svc = getLinearService();
  if (svc) {
    svc.getSummary(key).then(result => {
      summaryEl.empty();
      if (!result) {
        summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: "Linear integration disabled." });
        return;
      }
      if ("error" in result) {
        summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: result.error });
        return;
      }

      // Status pill with Linear's own colour — pick readable text per-colour
      // since Linear states range from pale grey to saturated red/green.
      statusPill.textContent = result.state.name;

      // Key link URL
      if (result.url) keyLink.dataset.url = result.url;

      titleEl.textContent = result.title;

      summaryEl.textContent = result.summary
        || (summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: t("roadmap.linear.noSummary") }), "");

      // Footer: "<assignee | Unassigned>  |  <age>"
      const assignee = result.assignee ?? t("roadmap.linear.unassigned");
      const age = result.updatedAt ? formatAge(result.updatedAt) : "";
      footerEl.textContent = age ? `${assignee}  ·  ${age}` : assignee;
    }).catch((err: unknown) => {
      summaryEl.empty();
      summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: (err as Error).message ?? t("roadmap.linear.error") });
    });
  }

  return el;
}
