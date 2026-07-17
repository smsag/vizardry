import type { NodeMapColor } from "../types";

/** Fixed named palette for Node Map boxes/links, in the same HSL family as
 *  matrix.ts's BASE_COLORS. A "#hex" color bypasses this and is used as-is. */
export const NODEMAP_PALETTE: Record<string, string> = {
  red: "hsl(0, 70%, 55%)",
  orange: "hsl(28, 85%, 55%)",
  yellow: "hsl(48, 85%, 50%)",
  green: "hsl(145, 55%, 42%)",
  teal: "hsl(175, 55%, 40%)",
  blue: "hsl(220, 65%, 55%)",
  purple: "hsl(270, 55%, 55%)",
  pink: "hsl(330, 65%, 60%)",
  gray: "hsl(220, 10%, 55%)",
};

/** Resolves a NodeMapColor value (palette name or #hex) to a usable CSS color. */
export function resolveNodeMapColor(color: NodeMapColor): string {
  return color.startsWith("#") ? color : (NODEMAP_PALETTE[color] ?? color);
}
