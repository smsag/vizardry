export interface Vec2 { x: number; y: number; }

/** Point on the boundary of a rect centered at (cx,cy) in the direction of (tx,ty). */
export function rectBoundary(
  cx: number, cy: number, hw: number, hh: number,
  tx: number, ty: number,
): Vec2 {
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy };
  const tX = Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity;
  const tY = Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: cx + dx * t, y: cy + dy * t };
}
