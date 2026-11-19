/**
 * InputSource: what the player wants this frame, independent of device. The keyboard+mouse
 * implementation lives in scenes/; gamepad or touch can be added later without touching the
 * player or weapon code (TDD: Project structure > Rules).
 */
export interface InputState {
  /** Normalised movement direction (length 0 or 1). */
  moveX: number;
  moveY: number;
  /** Aim angle in radians from the player. */
  aimAngle: number;
  /** Trigger held (or auto-fire on). */
  fire: boolean;
  /** Reload pressed this frame (edge, not held). */
  reload: boolean;
  /** Pause pressed this frame (edge). */
  pause: boolean;
  /** Build sheet pressed this frame (edge). */
  buildSheet: boolean;
}

export interface InputSource {
  /** Read the current state; (originX, originY) is the player's world position. */
  read(originX: number, originY: number): InputState;
}
