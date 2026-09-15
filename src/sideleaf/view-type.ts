import type { TicketRef } from "./types";

/** The registered Obsidian view type for the Vizardry sideleaf. */
export const VIZARDRY_VIEW_TYPE = "vizardry-sideleaf";

/**
 * What the singleton needs from the view — deliberately narrow, and declared
 * here rather than in view.ts.
 *
 * view.ts extends Obsidian's `ItemView`, so importing it pulls the Obsidian
 * runtime into whatever imports it. The badge layer only ever wants to *open*
 * a card, and it is reached from every renderer in the plugin; going through
 * this interface keeps `ItemView` out of that graph entirely (it also stopped
 * six unrelated test suites from having to stub a class they never touch).
 */
export interface SideleafHost {
  openCard(ref: TicketRef): void;
}
