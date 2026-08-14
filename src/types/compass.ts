/**
 * Types for the Product Compass canvas (`type: compass`) — a product/feature
 * discovery brief that acts as an index on top of a PRD and links out to the
 * deeper artifacts (an OST, a Test Card, …).
 *
 * The four sections are a fixed template; the content within each is freeform
 * `keyword: value` lines (repeatable, all optional), so it stays a light index
 * rather than a rigid form.
 */

/** A Case/Insights data point: an optional headline figure + its description. */
export interface CompassInsight {
  /** Headline figure, e.g. "40%", "3×", "12 interviews". "" when the line has
   *  no `figure |` split. */
  figure: string;
  text: string;
}

export interface CompassData {
  /** Challenge → Forces (JTBD + strategic foresight), freeform lines. */
  forces: string[];
  /** Challenge → Problem statement(s) — usually one; may carry a link. */
  problem: string[];
  /** Challenge → Case / Insights, as stat tiles. */
  insights: CompassInsight[];
  /** The single guiding outcome / metric. */
  northStar: string;
  /** Solution & Test ideas — where most of the outbound links live. */
  ideas: string[];
  /** Go-To-Market notes. */
  gtm: string[];
  /** Pricing notes. */
  pricing: string[];
  warnings: string[];
}
