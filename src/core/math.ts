import { UNIT_PX } from '../config';

/** Design units to pixels (1 unit = 32 px). */
export const u = (units: number): number => units * UNIT_PX;

/** Pixels to design units. */
export const toUnits = (px: number): number => px / UNIT_PX;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt(distSq(ax, ay, bx, by));

/** Angle in radians from (ax, ay) to (bx, by). */
export const angleTo = (ax: number, ay: number, bx: number, by: number): number =>
  Math.atan2(by - ay, bx - ax);

/** Normalise (x, y) into `out`. A zero vector stays zero. */
export const normalize = (x: number, y: number, out: { x: number; y: number }): { x: number; y: number } => {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    out.x = x / len;
    out.y = y / len;
  }
  return out;
};

/** Format seconds as m:ss for the HUD timer. */
export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
