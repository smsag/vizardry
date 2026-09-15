/**
 * Formatting helpers shared by the inline key badges and the sideleaf cards.
 *
 * Deliberately its own module with no imports: both the badge layer
 * (shared/key-enrichment) and the card layer (sideleaf/card) need these, and
 * the two already point at each other through the sideleaf singleton. Keeping
 * the helpers here means neither has to import the other to format a date.
 */

/** #rgb, #rgba, #rrggbb or #rrggbbaa — the forms both APIs actually return. */
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Paints the status eyebrow's rule in the state's own colour.
 *
 * The value comes from a third-party API response and lands in a CSS custom
 * property, so it is matched against a strict hex pattern first rather than
 * passed through: `setProperty` would otherwise accept arbitrary CSS, and a
 * value such as `red; background: url(...)` has no business reaching the
 * stylesheet. Anything that fails the test leaves the property unset, and the
 * eyebrow falls back to --text-muted.
 *
 * Nothing depends on the colour being right — the label always spells the
 * state out — so a rejected value costs no information.
 */
export function setStatusColor(el: HTMLElement, color: string | null | undefined): void {
  const trimmed = typeof color === "string" ? color.trim() : "";
  if (HEX_COLOR_RE.test(trimmed)) el.style.setProperty("--vzd-status-color", trimmed);
  else el.style.removeProperty("--vzd-status-color");
}

/** "Updated 6h ago" / "Created 3d ago", or "" when the date is unusable. */
export function formatKeyAge(dateStr: string, prefix: string): string {
  const parsed = new Date(dateStr).getTime();
  // An absent or unparseable timestamp (an API that omitted the field, an
  // empty string from the client's `?? ""` fallbacks) makes every arithmetic
  // result NaN, which would render as "Updated NaNd ago".
  if (!Number.isFinite(parsed)) return "";
  // A timestamp in the future — clock skew between the vault and the API —
  // would otherwise read as "Updated -1h ago".
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1)  return `${prefix} just now`;
  if (diffH < 24) return `${prefix} ${diffH}h ago`;
  return `${prefix} ${Math.floor(diffH / 24)}d ago`;
}
