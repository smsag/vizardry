/**
 * Shared plumbing for inline key enrichment (Linear's CORE-1234, Upvoty's
 * UPV-<uuid>): scanning rendered text for key patterns, wrapping matches in
 * a clickable badge, and managing the resulting preview popovers' lifecycle
 * (position, stacking order, dismissal).
 *
 * Linear and Upvoty's popover *content* differs enough (different fields,
 * Upvoty's extra vote count) that this deliberately does NOT try to unify
 * `buildPopover`'s body — each enrichment module still owns that. What's
 * shared here is the mechanical part that was previously duplicated
 * byte-for-byte in both files.
 */

import { setIcon } from "obsidian";
import { onDisconnected } from "./lifecycle";

// Tags whose content should never be enriched.
// PRE skips multi-line code blocks (and their CODE children). Inline CODE is
// intentionally kept so a key enriches normally even inside inline code. A
// is skipped because wrapping a match in a <button> would nest interactive
// content inside a link — invalid HTML that produces inconsistent
// click/focus behaviour.
export const SKIP_TAGS = new Set(["PRE", "INPUT", "TEXTAREA", "SCRIPT", "STYLE", "A"]);

// ── Open popovers ────────────────────────────────────────────────────────────
// One shared registry across ALL key-enrichment services (Linear, Upvoty),
// not one per service — otherwise each service's z-index counter starts
// from its own base and their popovers don't stack predictably relative to
// each other when both are open at once.

const openPopovers = new Map<HTMLElement, HTMLElement>();
let topZIndex = 1000;

export function closeKeyPopover(anchor: HTMLElement): void {
  const popover = openPopovers.get(anchor);
  if (popover) {
    popover.remove();
    openPopovers.delete(anchor);
  }
}

export function closeAllKeyPopovers(): void {
  for (const [anchor, popover] of openPopovers) {
    popover.remove();
    openPopovers.delete(anchor);
  }
  topZIndex = 1000;
}

export function bringKeyPopoverToFront(popover: HTMLElement): void {
  topZIndex += 1;
  popover.style.zIndex = String(topZIndex);
}

// ── Time formatting ──────────────────────────────────────────────────────────

export function formatKeyAge(dateStr: string, prefix: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1)  return `${prefix} just now`;
  if (diffH < 24) return `${prefix} ${diffH}h ago`;
  return `${prefix} ${Math.floor(diffH / 24)}d ago`;
}

// ── DOM walking ──────────────────────────────────────────────────────────────

/**
 * Scans `container` for text nodes matching `re` and replaces each match
 * with a clickable badge built by `makeBadge`. Safe to call multiple times
 * — nodes already wrapped in an element with `enrichedClass` are skipped.
 */
export function enrichKeys(
  container: HTMLElement,
  re: RegExp,
  enrichedClass: string,
  makeBadge: (doc: Document, key: string) => HTMLElement,
): void {
  const nodes: Text[] = [];
  collectTextNodes(container, re, enrichedClass, nodes);
  for (const node of nodes) wrapTextNode(node, re, makeBadge);
}

function collectTextNodes(node: Node, re: RegExp, enrichedClass: string, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    re.lastIndex = 0;
    if (re.test(node.textContent ?? "")) out.push(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (el.classList.contains(enrichedClass)) return;
  for (const child of Array.from(el.childNodes)) collectTextNodes(child, re, enrichedClass, out);
}

function wrapTextNode(node: Text, re: RegExp, makeBadge: (doc: Document, key: string) => HTMLElement): void {
  const text = node.textContent ?? "";
  const parent = node.parentNode;
  if (!parent) return;

  const doc = node.ownerDocument;
  const frag = doc.createDocumentFragment();
  let lastIndex = 0;
  re.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
    }
    frag.appendChild(makeBadge(doc, match[1]));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return;
  if (lastIndex < text.length) {
    frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
  }
  parent.replaceChild(frag, node);
}

// ── Click trigger ────────────────────────────────────────────────────────────

/**
 * Wires a key badge's click to open (or refocus) its preview popover, and
 * cleans up the popover if the badge itself leaves the DOM.
 */
export function attachKeyTrigger(
  btn: HTMLElement,
  isEnabled: () => boolean,
  buildPopover: (onClose: () => void) => HTMLElement,
): void {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const existing = openPopovers.get(btn);
    if (existing) { bringKeyPopoverToFront(existing); return; }
    if (!isEnabled()) return;
    const popover = buildPopover(() => closeKeyPopover(btn));
    btn.ownerDocument.body.appendChild(popover);
    bringKeyPopoverToFront(popover);
    openPopovers.set(btn, popover);
  });

  onDisconnected(btn, () => closeKeyPopover(btn));
}

// ── Popover shell ────────────────────────────────────────────────────────────

export interface KeyPopoverShell {
  el: HTMLElement;
  header: HTMLElement;
  statusPill: HTMLElement;
  keyLink: HTMLAnchorElement;
  titleEl: HTMLElement;
  summaryEl: HTMLElement;
  footer: HTMLElement;
}

/**
 * Builds the common popover shell — positioning (below-right of the anchor,
 * flipped to stay on-screen), the close button, and the header/title/
 * summary/footer skeleton every service's preview shares. The caller
 * populates `summaryEl`/`footer`/etc. from its own async fetch.
 */
export function buildKeyPopoverShell(opts: {
  anchor: HTMLElement;
  previewClass: string;
  keyText: string;
  keyAriaLabel: string;
  loadingText: string;
  onClose: () => void;
}): KeyPopoverShell {
  const { anchor, previewClass, keyText, keyAriaLabel, loadingText, onClose } = opts;
  const win = anchor.ownerDocument.defaultView ?? window;
  const el = anchor.ownerDocument.createElement("div");
  el.className = previewClass;
  el.addEventListener("mousedown", () => bringKeyPopoverToFront(el));

  // Position: below-right of anchor, flip as needed to stay on-screen.
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
  const closeBtn = el.createEl("button", { cls: `${previewClass}-close vzd-btn` });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); onClose(); });

  const header = el.createEl("div", { cls: `${previewClass}-header` });
  const statusPill = header.createEl("span", { cls: `${previewClass}-status` });
  const keyLink = header.createEl("a", { cls: `${previewClass}-key`, text: keyText }) as HTMLAnchorElement;
  keyLink.setAttribute("href", "#");
  keyLink.setAttribute("aria-label", keyAriaLabel);
  keyLink.addEventListener("click", (e) => {
    e.preventDefault();
    const url = keyLink.dataset.url;
    if (url) win.open(url, "_blank", "noopener");
  });

  const titleEl = el.createEl("div", { cls: `${previewClass}-title` });

  const body = el.createEl("div", { cls: `${previewClass}-body` });
  const summaryEl = body.createEl("p", { cls: `${previewClass}-summary` });
  summaryEl.createEl("span", { cls: `${previewClass}-loading`, text: loadingText });

  const footer = el.createEl("div", { cls: `${previewClass}-footer` });

  return { el, header, statusPill, keyLink, titleEl, summaryEl, footer };
}
