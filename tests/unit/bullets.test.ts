import { describe, expect, it, vi } from 'vitest';
import { BulletSystem } from '../../src/systems/bullets';
import { ObstacleField } from '../../src/systems/obstacles';
import type { ShotSpec } from '../../src/systems/weapon';

const shot = (overrides: Partial<ShotSpec> = {}): ShotSpec => ({
  angle: 0,
  speed: 600,
  range: 300,
  damage: 10,
  pierce: 0,
  knockback: 0,
  spreadDeg: 0,
  crit: false,
  volleyId: 1,
  ...overrides,
});

const open = () => new ObstacleField(10_000, 10_000);

function step(system: BulletSystem, field: ObstacleField, seconds: number, dt = 1 / 60) {
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) system.update(dt, field);
}

describe('BulletSystem', () => {
  it('moves bullets and expires them after exactly their range', () => {
    const sys = new BulletSystem(10, 4);
    const b = sys.spawn(shot(), 100, 100)!;
    step(sys, open(), 0.25);
    expect(b.active).toBe(true);
    expect(b.x).toBeCloseTo(250, 0);
    step(sys, open(), 0.5);
    expect(b.active).toBe(false);
    expect(b.x).toBeCloseTo(400); // 100 + range 300, never beyond
    expect(sys.activeCount).toBe(0);
  });

  it('stops at an obstacle even at a large frame step', () => {
    const field = open();
    field.addRect(300, 100, 16, 200);
    const sys = new BulletSystem(10, 4);
    const b = sys.spawn(shot({ speed: 3000, range: 2000 }), 100, 100)!;
    sys.update(0.05, field); // 150 px step, from x=100 to x=250
    sys.update(0.05, field); // would reach x=400, passing the wall at 292..308
    expect(b.active).toBe(false);
    expect(b.x).toBeCloseTo(300 - 8 - 4);
  });

  it('drops shots past the cap instead of growing', () => {
    const sys = new BulletSystem(2, 4);
    expect(sys.spawn(shot(), 0, 0)).not.toBeNull();
    expect(sys.spawn(shot(), 0, 0)).not.toBeNull();
    expect(sys.spawn(shot(), 0, 0)).toBeNull();
  });

  it('reuses released slots and resets their state', () => {
    const sys = new BulletSystem(1, 4);
    const a = sys.spawn(shot({ pierce: 3 }), 0, 0)!;
    a.hitIds.add(7);
    sys.release(a);
    const b = sys.spawn(shot({ pierce: 0 }), 5, 5)!;
    expect(b).toBe(a);
    expect(b.hitIds.size).toBe(0);
    expect(b.pierceLeft).toBe(0);
  });

  it('passes each frame segment to the hit handler and stops where it says', () => {
    const sys = new BulletSystem(1, 4);
    const b = sys.spawn(shot(), 0, 0)!;
    const handler = vi.fn(() => 0.5);
    sys.update(0.1, open(), handler); // segment 0 -> 60
    expect(handler).toHaveBeenCalledWith(b, 0, 0, 60, 0);
    expect(b.active).toBe(false);
    expect(b.x).toBeCloseTo(30);
  });
});
