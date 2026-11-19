import { describe, expect, it } from 'vitest';
import { clamp, formatTime, normalize, toUnits, u } from '../../src/core/math';

describe('math helpers', () => {
  it('converts units to pixels at 32 px per unit (TDD: World)', () => {
    expect(u(5)).toBe(160); // player move speed 5 units/s = 160 px/s
    expect(u(40)).toBe(1280); // the view is 40 units wide
    expect(toUnits(720)).toBe(22.5);
  });

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('normalises vectors and keeps zero at zero', () => {
    const out = { x: 0, y: 0 };
    normalize(3, 4, out);
    expect(out.x).toBeCloseTo(0.6);
    expect(out.y).toBeCloseTo(0.8);
    normalize(0, 0, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('formats the run timer as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(330)).toBe('5:30');
  });
});
