/**
 * Module-level access to the sideleaf, mirroring how the Linear and Upvoty
 * services are reached.
 *
 * A key badge is rendered deep inside a markdown post-processor with no route
 * back to the plugin instance, so the `app` needed to open a leaf is parked
 * here at load rather than threaded through six badge call sites.
 */

import type { App, WorkspaceLeaf } from "obsidian";
import { Notice } from "obsidian";
import { t } from "../i18n";
import { VIZARDRY_VIEW_TYPE } from "./view-type";
import type { SideleafHost } from "./view-type";
import type { TicketRef } from "./types";

let _app: App | null = null;
let _view: SideleafHost | null = null;

export function initSideleaf(app: App | null): void {
  _app = app;
  if (!app) _view = null;
}

/**
 * The view announces itself here as it opens, instead of the singleton
 * reaching into the workspace to find it — which would mean importing the
 * view class, and with it Obsidian's ItemView, into the badge layer.
 */
export function registerSideleafView(view: SideleafHost): void {
  _view = view;
}

export function unregisterSideleafView(view: SideleafHost): void {
  if (_view === view) _view = null;
}

/**
 * Reveals the sideleaf, creating it in the right sidebar if it isn't open.
 *
 * `revealLeaf` expands a collapsed sidebar and switches to the tab, but does
 * not move focus — a key click should show the card without taking the caret
 * out of the note being written.
 */
let _opening: Promise<void> | null = null;

export async function revealSideleaf(): Promise<SideleafHost | null> {
  if (!_app) return null;
  const app = _app;
  if (!_view) {
    // A leaf can exist without `_view` being set yet (its onOpen has not run,
    // or the workspace restored it lazily). Reuse it rather than creating a
    // second Vizardry tab; and two clicks in the same tick share one creation.
    if (!_opening) {
      _opening = (async () => {
        const leaf: WorkspaceLeaf | null =
          app.workspace.getLeavesOfType(VIZARDRY_VIEW_TYPE)[0] ?? app.workspace.getRightLeaf(false);
        if (!leaf) return;
        // Creating the leaf runs the view's onOpen, which registers it above.
        await leaf.setViewState({ type: VIZARDRY_VIEW_TYPE, active: false });
      })().finally(() => { _opening = null; });
    }
    await _opening;
  }
  const target = app.workspace.getLeavesOfType(VIZARDRY_VIEW_TYPE)[0];
  if (target) void app.workspace.revealLeaf(target);
  return _view;
}

/**
 * Opens (or surfaces) a card for `ref`. This is what a key badge click does —
 * the popovers it replaces were appended to document.body and positioned by
 * hand against the viewport.
 */
export function openTicketCard(ref: TicketRef): void {
  revealSideleaf().then(view => view?.openCard(ref)).catch((err: unknown) => {
    console.error("Vizardry: could not open the sideleaf", err);
    new Notice(t("sideleaf.openFailed"));
  });
}
