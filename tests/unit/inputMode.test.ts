import { describe, expect, it } from 'vitest';
import {
  controlMode,
  guessDevice,
  nextControlSetting,
  stickVector,
  type StickVector,
} from '../../src/systems/inputMode';
import { SaveSchema, freshSave } from '../../src/systems/save';

const out = (): StickVector => ({ x: 0, y: 0, strength: 0 });

describe('guessDevice', () => {
  it('a finger as the main pointer on a touch screen means touch', () => {
    expect(guessDevice({ coarsePointer: true, maxTouchPoints: 5, forceTouch: false })).toBe('touch');
  });
  it('a touchscreen laptop with a mouse means keyboard', () => {
    expect(guessDevice({ coarsePointer: false, maxTouchPoints: 10, forceTouch: false })).toBe('keyboard');
  });
  it('a desktop means keyboard', () => {
    expect(guessDevice({ coarsePointer: false, maxTouchPoints: 0, forceTouch: false })).toBe('keyboard');
  });
  it('?touch forces touch', () => {
    expect(guessDevice({ coarsePointer: false, maxTouchPoints: 0, forceTouch: true })).toBe('touch');
  });
});

describe('controlMode', () => {
  it('Auto follows the last device used', () => {
    expect(controlMode('auto', 'touch')).toBe('touch');
    expect(controlMode('auto', 'keyboard')).toBe('keyboard');
  });
  it('a forced setting ignores the device', () => {
    expect(controlMode('touch', 'keyboard')).toBe('touch');
    expect(controlMode('keyboard', 'touch')).toBe('keyboard');
  });
  it('the Settings button cycles Auto → Touch → Keyboard → Auto', () => {
    expect(nextControlSetting('auto')).toBe('touch');
    expect(nextControlSetting('touch')).toBe('keyboard');
    expect(nextControlSetting('keyboard')).toBe('auto');
  });
});

describe('stickVector', () => {
  it('reads nothing at rest and inside the dead zone', () => {
    expect(stickVector(0, 0, 64, 0.15, out())).toEqual({ x: 0, y: 0, strength: 0 });
    expect(stickVector(9, 0, 64, 0.15, out()).strength).toBe(0); // 9/64 < 0.15
  });
  it('reaches full strength at the radius and stays there beyond it', () => {
    const v = stickVector(0, -64, 64, 0.15, out());
    expect(v.strength).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(-1);
    expect(stickVector(200, 0, 64, 0.15, out()).strength).toBe(1);
  });
  it('stretches the range past the dead zone back to 0..1', () => {
    // Halfway between the dead zone edge and the radius reads 0.5.
    const half = 64 * (0.15 + 0.85 / 2);
    expect(stickVector(half, 0, 64, 0.15, out()).strength).toBeCloseTo(0.5);
  });
  it('keeps the direction and a length of at most 1 on diagonals', () => {
    const v = stickVector(100, 100, 64, 0.15, out());
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(Math.PI / 4);
  });
});

describe('Controls setting in the save', () => {
  it('a fresh save uses Auto', () => {
    expect(freshSave().settings.controls).toBe('auto');
  });
  it('an older save without the setting loads as Auto', () => {
    const old = freshSave() as unknown as { settings: Record<string, unknown> };
    delete old.settings.controls;
    expect(SaveSchema.parse(old).settings.controls).toBe('auto');
  });
});
