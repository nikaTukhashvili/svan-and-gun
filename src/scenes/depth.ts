/** Draw order inside GameScene. */
export const Depth = {
  ground: 0,
  obstacles: 10,
  pickups: 20,
  enemies: 30,
  bullets: 40,
  player: 50,
  effects: 60,
  overlay: 100,
} as const;
