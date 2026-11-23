/**
 * Control mode (GDD: Controls > Mobile): which InputSource drives the player. Pure rules; the
 * browser probing (pointer media query, touch/key events) lives in scenes/input/deviceTracker.
 */

/** The Controls setting: follow the last device used, or force one. */
export const CONTROL_SETTINGS = ['auto', 'touch', 'keyboard'] as const;
export type ControlSetting = (typeof CONTROL_SETTINGS)[number];

/** The device actually driving the game: twin-stick touch, or keyboard and mouse. */
export type Device = 'touch' | 'keyboard';

export interface DeviceCaps {
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  coarsePointer: boolean;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
  /** The `?touch` URL flag (testing on a desktop). */
  forceTouch: boolean;
}

/** First guess at startup, before the player has touched or pressed anything. */
export function guessDevice(caps: DeviceCaps): Device {
  if (caps.forceTouch) return 'touch';
  return caps.coarsePointer && caps.maxTouchPoints > 0 ? 'touch' : 'keyboard';
}

/** The mode in use: the setting wins unless it is Auto, which follows the last device used. */
export function controlMode(setting: ControlSetting, lastDevice: Device): Device {
  return setting === 'auto' ? lastDevice : setting;
}

/** The next Controls setting when the Settings button is pressed. */
export function nextControlSetting(setting: ControlSetting): ControlSetting {
  return CONTROL_SETTINGS[(CONTROL_SETTINGS.indexOf(setting) + 1) % CONTROL_SETTINGS.length]!;
}

export interface StickVector {
  /** Direction times strength: length 0..1. */
  x: number;
  y: number;
  /** Strength after the dead zone, 0..1. */
  strength: number;
}

/**
 * A virtual stick's output from the thumb's offset (dx, dy) from where it landed. The offset is
 * clamped to `radius`; inside the dead zone (a fraction of the radius) the stick reads 0, and the
 * rest of the range is stretched back to 0..1 so the stick has no dead jump at its edge.
 */
export function stickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
  out: StickVector,
): StickVector {
  const dist = Math.hypot(dx, dy);
  const raw = Math.min(dist / radius, 1);
  if (dist === 0 || raw <= deadZone) {
    out.x = 0;
    out.y = 0;
    out.strength = 0;
    return out;
  }
  const strength = (raw - deadZone) / (1 - deadZone);
  out.x = (dx / dist) * strength;
  out.y = (dy / dist) * strength;
  out.strength = strength;
  return out;
}
