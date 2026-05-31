/** Minimum horizontal swipe distance (px) to trigger carousel navigation. */
export const SWIPE_THRESHOLD_PX = 40;

/**
 * Horizontal margin subtracted from the available container width when
 * Obsidian's "readable line length" setting is active. Prevents the canvas
 * from running edge-to-edge against the content padding.
 */
export const FULL_WIDTH_MARGIN_PX = 32;

/** Maximum characters shown in a SIPOC Flow node label before truncation with "…". */
export const SIPOC_FLOW_LABEL_MAX_CHARS = 16;

/** Approximate character width (px) used for Wardley Map label overlap estimation. */
export const WARDLEY_CHAR_W_PX = 7;
/** Minimum vertical gap (px) enforced between any two Wardley Map label baselines. */
export const WARDLEY_LABEL_MIN_GAP_PX = 14;
/** Horizontal proximity threshold (px) within which two Wardley labels are considered overlapping. */
export const WARDLEY_LABEL_OVERLAP_X_PX = 80;
/** Maximum pixels a label may be nudged from its natural position before a leader line is drawn. */
export const WARDLEY_LABEL_MAX_NUDGE_PX = 30;
