import { getLinearService } from "../linear";
import { t } from "../i18n";
import { enrichKeys, attachKeyTrigger, buildKeyPopoverShell, formatKeyAge } from "./key-enrichment";

// Matches LINEAR-style identifiers like CORE-1234, PSINT-42, ENG-9999
export const LINEAR_KEY_RE = /\b([A-Z]{2,10}-\d+)\b/g;

/**
 * Scans `container` for Linear issue keys in text nodes and replaces each
 * match with a `.vzd-linear-key` button that fetches and previews the issue
 * when clicked. Safe to call multiple times — already-enriched keys are
 * skipped.
 */
export function enrichLinearKeys(container: HTMLElement): void {
  enrichKeys(container, LINEAR_KEY_RE, "vzd-linear-key", (doc, key) => {
    const btn = doc.createElement("button");
    btn.className = "vzd-linear-key";
    btn.textContent = key;
    btn.setAttribute("aria-label", `Linear: ${key}`);
    attachTrigger(btn, key);
    return btn;
  });
}

/**
 * Renders a `.vzd-linear-key` badge for an explicitly-annotated key (e.g.
 * `[label](CORE-1234)`) — as opposed to `enrichLinearKeys`'s blind text-node
 * scan, this is for a key the caller already knows, attached to an item
 * whose own visible text may not contain it at all. No-ops if the Linear
 * integration isn't enabled, matching the same gating `enrichLinearKeys`
 * already applies before scanning (see main.ts) — never renders an inert
 * badge that can't do anything when clicked.
 */
export function renderLinearKeyBadge(parent: HTMLElement, key: string): void {
  if (!getLinearService()?.isEnabled()) return;
  const btn = parent.createEl("button", { cls: "vzd-linear-key", text: key });
  btn.setAttribute("aria-label", `Linear: ${key}`);
  attachTrigger(btn, key);
}

// ── Click trigger ────────────────────────────────────────────────────────────

function attachTrigger(btn: HTMLElement, key: string): void {
  attachKeyTrigger(
    btn,
    () => !!getLinearService()?.isEnabled(),
    (onClose) => buildPopover(key, btn, onClose),
  );
}

// ── Popover ──────────────────────────────────────────────────────────────────

function buildPopover(key: string, anchor: HTMLElement, onClose: () => void): HTMLElement {
  const shell = buildKeyPopoverShell({
    anchor,
    previewClass: "vzd-linear-preview",
    keyText: key,
    keyAriaLabel: `Open ${key} in Linear`,
    loadingText: t("roadmap.linear.loading"),
    onClose,
  });
  const { el, statusPill, keyLink, titleEl, summaryEl, footer } = shell;
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

      if (result.summary) {
        summaryEl.textContent = result.summary;
      } else {
        summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: t("roadmap.linear.noSummary") });
      }

      // Footer: "<assignee | Unassigned>  |  <age>"
      const assignee = result.assignee ?? t("roadmap.linear.unassigned");
      const age = result.updatedAt ? formatKeyAge(result.updatedAt, "Updated") : "";
      footerEl.textContent = age ? `${assignee}  ·  ${age}` : assignee;
    }).catch((err: unknown) => {
      summaryEl.empty();
      summaryEl.createEl("span", { cls: "vzd-linear-preview-error", text: (err as Error).message ?? t("roadmap.linear.error") });
    });
  }

  return el;
}
