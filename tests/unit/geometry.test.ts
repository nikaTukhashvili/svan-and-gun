import { describe, expect, it } from 'vitest';
import { segmentCircle, segmentRect } from '../../src/core/geometry';
import { ObstacleField } from '../../src/systems/obstacles';
import { u } from '../../src/core/math';
import { loadGameData } from '../helpers/loadData';

describe('segmentCircle', () => {
  it('finds the entry point', () => {
    // From x=0 to x=10 along y=0, circle at x=6 radius 1: enters at x=5 -> t=0.5
    expect(segmentCircle(0, 0, 10, 0, 6, 0, 1)).toBeCloseTo(0.5);
  });

  it('returns 0 when the segment starts inside', () => {
    expect(segmentCircle(6, 0, 10, 0, 6, 0, 1)).toBe(0);
  });

  it('returns null on a miss, or when the circle is beyond the segment end', () => {
    expect(segmentCircle(0, 0, 10, 0, 5, 3, 1)).toBeNull();
    expect(segmentCircle(0, 0, 3, 0, 6, 0, 1)).toBeNull();
    expect(segmentCircle(0, 0, 10, 0, -5, 0, 1)).toBeNull(); // behind the start
  });
});

describe('segmentRect', () => {
  it('finds the entry point on each axis', () => {
    expect(segmentRect(0, 5, 10, 5, 4, 0, 6, 10)).toBeCloseTo(0.4);
    expect(segmentRect(5, 0, 5, 10, 0, 7, 10, 9)).toBeCloseTo(0.7);
  });

  it('handles diagonal segments and misses', () => {
    expect(segmentRect(0, 0, 10, 10, 4, 4, 6, 6)).toBeCloseTo(0.4);
    expect(segmentRect(0, 0, 10, 0, 4, 1, 6, 3)).toBeNull();
  });

  it('returns 0 when starting inside', () => {
    expect(segmentRect(5, 5, 9, 9, 4, 4, 6, 6)).toBe(0);
  });
});

describe('ObstacleField', () => {
  it('stops a fast bullet at a thin fence instead of tunnelling through it', () => {
    const field = new ObstacleField(1000, 1000);
    field.addRect(500, 500, 200, u(0.5)); // a 16 px thick fence
    // A clamped 50 ms frame of a Long Rifling bullet: ~70 px, more than 4x the fence's thickness.
    const t = field.firstHit(500, 460, 500, 530, 4);
    expect(t).not.toBeNull();
    expect(460 + 70 * t!).toBeCloseTo(500 - u(0.25) - 4);
  });

  it('builds the Level 1 map: the tower blocks, the player start does not', () => {
    const map = loadGameData().maps.level1!;
    const field = ObstacleField.fromMap(map);
    expect(field.shapes).toHaveLength(map.obstacles.length);
    expect(field.blocked(u(map.tower.x), u(map.tower.y), 1)).toBe(true);
    expect(field.blocked(u(map.playerStart.x), u(map.playerStart.y), u(0.45))).toBe(false);
    expect(field.blocked(-5, 100, 1)).toBe(true); // outside the world
  });

  it('can remove shapes (expiring rubble)', () => {
    const field = new ObstacleField(100, 100);
    const rubble = field.addCircle(50, 50, 5);
    field.remove(rubble);
    expect(field.blocked(50, 50, 1)).toBe(false);
  });
});
