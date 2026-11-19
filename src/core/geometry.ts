/**
 * Swept hit tests. Arcade Physics has no swept collision, and a fast bullet moves farther in
 * one frame than a fence is thick, so bullets test the segment they travelled this frame
 * (TDD: World, physics and timing).
 *
 * Each function returns the fraction t in [0, 1] along the segment (x0,y0)->(x1,y1) where it
 * first touches the shape, 0 if it starts inside, or null if it misses.
 */

export function segmentCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number | null {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // starts inside

  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null; // zero-length segment outside the circle

  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** Axis-aligned rectangle given by its edges. Slab method. */
export function segmentRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number | null {
  if (x0 >= left && x0 <= right && y0 >= top && y0 <= bottom) return 0;

  const dx = x1 - x0;
  const dy = y1 - y0;
  let tMin = 0;
  let tMax = 1;

  for (const [p0, d, lo, hi] of [
    [x0, dx, left, right],
    [y0, dy, top, bottom],
  ] as const) {
    if (d === 0) {
      if (p0 < lo || p0 > hi) return null;
      continue;
    }
    let tA = (lo - p0) / d;
    let tB = (hi - p0) / d;
    if (tA > tB) [tA, tB] = [tB, tA];
    if (tA > tMin) tMin = tA;
    if (tB < tMax) tMax = tB;
    if (tMin > tMax) return null;
  }
  return tMin;
}
