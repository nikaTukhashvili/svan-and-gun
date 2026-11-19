/**
 * Phase 1 has no art: every entity is a coloured shape generated at boot with
 * Graphics.generateTexture(), so no image files are needed (TDD: World > Map).
 */
import Phaser from 'phaser';
import type { GameData } from '../data/types';
import { u } from '../core/math';

type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon';

export const TextureKeys = {
  player: 'tex:player',
  bullet: 'tex:bullet',
  enemyProjectile: 'tex:enemyProjectile',
  scrapSmall: 'tex:scrap:small',
  scrapMedium: 'tex:scrap:medium',
  scrapLarge: 'tex:scrap:large',
  silver: 'tex:silver',
  kubdari: 'tex:kubdari',
  huntingHorn: 'tex:huntingHorn',
  chest: 'tex:chest',
  crate: 'tex:crate',
  powderBarrel: 'tex:powderBarrel',
  boss: 'tex:boss',
  eliteRing: 'tex:eliteRing',
  enemy: (id: string) => `tex:enemy:${id}`,
} as const;

/** Radius (px) of the elite ring texture before scaling. */
export const ELITE_RING_RADIUS = 32;

const hex = (css: string): number => parseInt(css.slice(1), 16);

/** Darker version of a colour for outlines. */
const darken = (color: number, f = 0.55): number => {
  const r = ((color >> 16) & 0xff) * f;
  const g = ((color >> 8) & 0xff) * f;
  const b = (color & 0xff) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

function polygon(cx: number, cy: number, r: number, sides: number, rotation: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

function makeShape(
  scene: Phaser.Scene,
  key: string,
  shape: Shape,
  radiusPx: number,
  color: number,
  outline = 2,
  strokeColor = darken(color),
): void {
  if (scene.textures.exists(key)) return;
  const size = Math.ceil(radiusPx * 2 + outline * 2);
  const c = size / 2;
  const r = radiusPx;
  const g = scene.make.graphics({}, false);
  g.fillStyle(color, 1);
  g.lineStyle(outline, strokeColor, 1);
  switch (shape) {
    case 'circle':
      g.fillCircle(c, c, r);
      g.strokeCircle(c, c, r);
      break;
    case 'square':
      g.fillRect(c - r, c - r, r * 2, r * 2);
      g.strokeRect(c - r, c - r, r * 2, r * 2);
      break;
    case 'triangle': {
      // Points along +x, so a sprite's rotation shows its facing.
      const pts = polygon(c, c, r, 3, 0);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      break;
    }
    case 'diamond': {
      const pts = polygon(c, c, r, 4, 0);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      break;
    }
    case 'hexagon': {
      const pts = polygon(c, c, r, 6, Math.PI / 6);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      break;
    }
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

export function generatePlaceholderTextures(scene: Phaser.Scene, data: GameData): void {
  makeShape(scene, TextureKeys.player, 'circle', u(data.config.player.radius), 0x3d8bfd, 3);
  makeShape(scene, TextureKeys.bullet, 'circle', 4, 0xffe066, 1);
  makeShape(scene, TextureKeys.enemyProjectile, 'diamond', 6, 0xb455ff, 1);

  makeShape(scene, TextureKeys.scrapSmall, 'diamond', 5, 0x9fd8a0, 1);
  makeShape(scene, TextureKeys.scrapMedium, 'diamond', 7, 0x5fc46a, 1);
  makeShape(scene, TextureKeys.scrapLarge, 'diamond', 10, 0x2e9b45, 2);
  makeShape(scene, TextureKeys.silver, 'circle', 6, 0xd9dde3, 1);
  makeShape(scene, TextureKeys.kubdari, 'circle', 9, 0xd9893a, 2);
  makeShape(scene, TextureKeys.huntingHorn, 'triangle', 10, 0xf2e6c9, 2);
  makeShape(scene, TextureKeys.chest, 'square', 11, 0xf2b632, 2);
  makeShape(scene, TextureKeys.crate, 'square', 14, 0x9c6b3e, 2);
  // Bright hoop so the barrel reads as a hazard, not as a dark enemy.
  makeShape(scene, TextureKeys.powderBarrel, 'circle', 13, 0x5a3b26, 4, 0xffcc33);

  if (!scene.textures.exists(TextureKeys.eliteRing)) {
    // Gold outline for elites; scaled to each elite's radius at runtime.
    const g = scene.make.graphics({}, false);
    g.lineStyle(4, 0xf2b632, 1).strokeCircle(ELITE_RING_RADIUS + 2, ELITE_RING_RADIUS + 2, ELITE_RING_RADIUS);
    g.generateTexture(TextureKeys.eliteRing, ELITE_RING_RADIUS * 2 + 4, ELITE_RING_RADIUS * 2 + 4);
    g.destroy();
  }

  for (const e of data.enemies) {
    makeShape(scene, TextureKeys.enemy(e.id), e.visual.shape, u(e.radius), hex(e.visual.color));
  }
  makeShape(
    scene,
    TextureKeys.boss,
    data.boss.visual.shape,
    u(data.boss.radius),
    hex(data.boss.visual.color),
    4,
  );
}
