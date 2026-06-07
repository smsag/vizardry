import { getLinearService } from "../linear";
import { t } from "../i18n";
import { onDisconnected } from "./lifecycle";

// Matches LINEAR-style identifiers like CORE-1234, PSINT-42, ENG-9999
const LINEAR_KEY_RE = /\b([A-Z]{2,10}-\d+)\b/g;

// Tags whose content should never be enriched
// PRE skips multi-line code blocks (and their CODE children). Inline CODE is
// intentionally kept so `` `CORE-1234` `` enriches on hover.
const SKIP_TAGS = new Set(["PRE", "INPUT", "TEXTAREA", "SCRIPT", "STYLE"]);

// ── DOM walking ──────────────────────────────────────────────────────────────

/**
 * Scans `container` for Linear issue keys in text nodes and wraps each match
 * in a hoverable `.vzd-linear-key` span. Safe to call multiple times —
 * already-enriched spans are skipped.
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

  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  LINEAR_KEY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINEAR_KEY_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const span = document.createElement("span");
    span.className = "vzd-linear-key";
    span.textContent = match[1];
    attachHover(span, match[1]);
    frag.appendChild(span);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return;
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  parent.replaceChild(frag, node);
}

// ── Hover popover ────────────────────────────────────────────────────────────

function attachHover(span: HTMLElement, key: string): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let popover: HTMLElement | null = null;

  const clear = (): void => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (popover) { popover.remove(); popover = null; }
  };

  span.addEventListener("mouseenter", () => {
    if (!getLinearService()?.isEnabled()) return;
    timer = setTimeout(() => {
      timer = null;
      popover = buildPopover(key, span);
      document.body.appendChild(popover);
    }, 400);
  });

  span.addEventListener("mouseleave", clear);
  onDisconnected(span, clear);
}

function buildPopover(key: string, anchor: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "vzd-linear-preview";

  // Position: right of anchor, flip left if off-screen
  const rect = anchor.getBoundingClientRect();
  const width = 320;
  let left = rect.right + 8;
  if (left + width > window.innerWidth - 8) left = rect.left - width - 8;
  let top = rect.top;
  if (top + 200 > window.innerHeight - 8) top = window.innerHeight - 208;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top  = `${Math.max(8, top)}px`;

  // Header row: key badge + status pill + assignee
  const header = el.createEl("div", { cls: "vzd-linear-preview-header" });
  header.createEl("span", { cls: "vzd-linear-key", text: key });
  const statusPill = header.createEl("span", { cls: "vzd-linear-preview-status" });
  const assigneeEl = header.createEl("span", { cls: "vzd-linear-preview-assignee" });

  // Title on its own line
  const titleSpan = el.createEl("div", { cls: "vzd-linear-preview-title" });

  // Body
  const body = el.createEl("div", { cls: "vzd-linear-preview-body" });
  const summaryEl = body.createEl("p", { cls: "vzd-linear-preview-summary" });
  summaryEl.createEl("span", { cls: "vzd-linear-preview-loading", text: t("roadmap.linear.loading") });

  // Footer
  const footer = el.createEl("div", { cls: "vzd-linear-preview-footer" });
  const updatedEl = footer.createEl("span", { cls: "vzd-linear-preview-updated" });

  // Async: fetch status + summary together via getSummary
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
      titleSpan.textContent = result.title;
      statusPill.textContent = result.state.name;
      if (result.assignee) assigneeEl.textContent = result.assignee;

      if (result.summary) {
        summaryEl.textContent = result.summary;
      } else {
        summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: t("roadmap.linear.noSummary") });
      }

      const diffH = Math.round((Date.now() - new Date(result.updatedAt).getTime()) / 3_600_000);
      updatedEl.textContent = diffH < 1 ? "Updated just now" : `Updated ${diffH}h ago`;
    }).catch((err: unknown) => {
      summaryEl.empty();
      summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: (err as Error).message ?? t("roadmap.linear.error") });
    });
  }

  return el;
}
