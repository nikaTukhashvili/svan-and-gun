/**
 * Phase 1 has no art: every entity is drawn at boot with Graphics.generateTexture(), so no image
 * files are needed (TDD: World > Map). Shapes carry simple symbols (a cross on the medkit, a lock
 * on chests, eyes on enemies) so things read at a glance.
 */
import Phaser from 'phaser';
import type { GameData } from '../data/types';
import { u } from '../core/math';

type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon';
type G = Phaser.GameObjects.Graphics;
const V = Phaser.Math.Vector2;

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
  chestSupply: 'tex:chest:supply',
  chestElite: 'tex:chest:elite',
  crate: 'tex:crate',
  powderBarrel: 'tex:powderBarrel',
  boss: 'tex:boss',
  eliteRing: 'tex:eliteRing',
  enemy: (id: string) => `tex:enemy:${id}`,
} as const;

/** Shapes that turn to face where they move (their texture points along +x). */
export const FACING_SHAPES: ReadonlySet<string> = new Set(['triangle', 'diamond']);

/** Radius (px) of the elite ring texture before scaling. */
export const ELITE_RING_RADIUS = 32;

const hex = (css: string): number => parseInt(css.slice(1), 16);

/** Scale a colour's channels: below 1 darkens, above 1 lightens. */
const shade = (color: number, f = 0.55): number => {
  const ch = (s: number) => Math.min(255, Math.round(((color >> s) & 0xff) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

function polygon(cx: number, cy: number, r: number, sides: number, rotation: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push(new V(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

/** Draw into a w×h texture once. */
function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
}

function shapePoints(shape: Shape, c: number, r: number): Phaser.Math.Vector2[] | null {
  switch (shape) {
    case 'circle':
      return null;
    case 'square':
      return [new V(c - r, c - r), new V(c + r, c - r), new V(c + r, c + r), new V(c - r, c + r)];
    case 'triangle':
      return polygon(c, c, r, 3, 0); // points along +x, so rotation shows facing
    case 'diamond':
      return polygon(c, c, r, 4, 0);
    case 'hexagon':
      return polygon(c, c, r, 6, Math.PI / 6);
  }
}

function fillShape(g: G, shape: Shape, c: number, r: number, stroke: boolean): void {
  const pts = shapePoints(shape, c, r);
  if (!pts) {
    g.fillCircle(c, c, r);
    if (stroke) g.strokeCircle(c, c, r);
  } else {
    g.fillPoints(pts, true);
    if (stroke) g.strokePoints(pts, true);
  }
}

type Face = 'none' | 'eyes' | 'target';

/** A body shape with a lighter top-left highlight, and optionally eyes or a target mark. */
function makeBody(
  scene: Phaser.Scene,
  key: string,
  shape: Shape,
  r: number,
  color: number,
  outline: number,
  face: Face,
  strokeColor = shade(color),
): void {
  const size = Math.ceil(r * 2 + outline * 2);
  const c = size / 2;
  make(scene, key, size, size, (g) => {
    g.fillStyle(color, 1);
    g.lineStyle(outline, strokeColor, 1);
    fillShape(g, shape, c, r, true);
    // Soft highlight towards the top left.
    g.fillStyle(shade(color, 1.35), 0.55);
    g.fillCircle(c - r * 0.28, c - r * 0.3, r * 0.38);

    if (face === 'eyes') {
      // Facing shapes look along +x; the rest look "down" at the player like a top-down face.
      const facing = FACING_SHAPES.has(shape);
      const er = Math.max(1.6, r * 0.17);
      const fwd = facing ? r * 0.12 : 0;
      const side = r * 0.28;
      const eyes = facing
        ? [
            [c + fwd, c - side],
            [c + fwd, c + side],
          ]
        : [
            [c - side, c - r * 0.05],
            [c + side, c - r * 0.05],
          ];
      for (const [x, y] of eyes) {
        g.fillStyle(0xffffff, 1).fillCircle(x!, y!, er);
        g.fillStyle(0x16181c, 1).fillCircle(
          x! + (facing ? er * 0.4 : 0),
          y! + (facing ? 0 : er * 0.3),
          er * 0.55,
        );
      }
    } else if (face === 'target') {
      g.lineStyle(Math.max(1.5, r * 0.1), 0xb03a2e, 0.9);
      g.strokeCircle(c, c, r * 0.6);
      g.fillStyle(0xb03a2e, 0.9).fillCircle(c, c, r * 0.22);
    }
  });
}

/** Plain shape (bullets, projectiles). */
function makeShape(
  scene: Phaser.Scene,
  key: string,
  shape: Shape,
  r: number,
  color: number,
  outline = 1,
): void {
  const size = Math.ceil(r * 2 + outline * 2);
  make(scene, key, size, size, (g) => {
    g.fillStyle(color, 1).lineStyle(outline, shade(color), 1);
    fillShape(g, shape, size / 2, r, true);
  });
}

/** Scrap: a hex nut (small) or a cog with `teeth` teeth. */
function makeScrap(scene: Phaser.Scene, key: string, r: number, color: number, teeth: number): void {
  const size = Math.ceil(r * 2 + 4);
  const c = size / 2;
  make(scene, key, size, size, (g) => {
    const dark = shade(color, 0.5);
    g.lineStyle(1.5, dark, 1).fillStyle(color, 1);
    if (teeth === 0) {
      const pts = polygon(c, c, r, 6, 0);
      g.fillPoints(pts, true).strokePoints(pts, true);
    } else {
      const pts: Phaser.Math.Vector2[] = [];
      const steps = teeth * 4;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rr = i % 4 < 2 ? r : r * 0.74;
        pts.push(new V(c + Math.cos(a) * rr, c + Math.sin(a) * rr));
      }
      g.fillPoints(pts, true).strokePoints(pts, true);
    }
    g.fillStyle(shade(color, 1.3), 0.6).fillCircle(c - r * 0.25, c - r * 0.25, r * 0.3);
    g.fillStyle(dark, 1).fillCircle(c, c, r * 0.32);
  });
}

function generatePickups(scene: Phaser.Scene): void {
  makeScrap(scene, TextureKeys.scrapSmall, 5, 0x9fd8a0, 0);
  makeScrap(scene, TextureKeys.scrapMedium, 7, 0x5fc46a, 6);
  makeScrap(scene, TextureKeys.scrapLarge, 10, 0x2e9b45, 8);

  // Silver coin: rim, inner ring, shine.
  make(scene, TextureKeys.silver, 16, 16, (g) => {
    g.fillStyle(0xd9dde3, 1).lineStyle(1.5, 0x7d8590, 1).fillCircle(8, 8, 6.5).strokeCircle(8, 8, 6.5);
    g.lineStyle(1, 0x9aa3ad, 1).strokeCircle(8, 8, 4);
    g.fillStyle(0xffffff, 0.9).fillCircle(6, 5.5, 1.6);
  });

  // Kubdari heals: a medkit with a red cross.
  make(scene, TextureKeys.kubdari, 26, 24, (g) => {
    g.fillStyle(0x8a3a2a, 1).fillRoundedRect(9, 1, 8, 5, 2); // handle
    g.fillStyle(0xf4f1ea, 1).lineStyle(2, 0x8a3a2a, 1);
    g.fillRoundedRect(2, 4, 22, 18, 4).strokeRoundedRect(2, 4, 22, 18, 4);
    g.fillStyle(0xe23b3b, 1);
    g.fillRect(10.5, 7, 5, 12);
    g.fillRect(7, 10.5, 12, 5);
  });

  // Hunting horn (pulls in all scrap): a curved horn, growing towards the bell, with bands.
  make(scene, TextureKeys.huntingHorn, 32, 24, (g) => {
    // A gentle arc from the mouthpiece (left) to the bell (right).
    const at = (t: number) => ({
      x: 4 + t * 20,
      y: 15 - Math.sin(t * Math.PI) * 6 + t * 2,
      r: 1.6 + t * t * 5,
    });
    const body = (color: number, pad: number, from = 0, to = 1) => {
      g.fillStyle(color, 1);
      for (let t = from; t <= to + 1e-6; t += 0.02) {
        const p = at(t);
        g.fillCircle(p.x, p.y, p.r + pad);
      }
    };
    body(0x5a3b20, 1.3);
    body(0xf2e6c9, 0);
    // Brass bands.
    body(0xc89a3a, 0, 0.38, 0.44);
    body(0xc89a3a, 0, 0.72, 0.78);
    body(0x7a5a2a, 0, 0, 0.06); // mouthpiece
    // Bell: a flared rim and the dark opening.
    const b = at(1);
    g.fillStyle(0x5a3b20, 1).fillEllipse(b.x + 1, b.y, 7, 16);
    g.fillStyle(0xe2d2a8, 1).fillEllipse(b.x + 1, b.y, 5, 13.5);
    g.fillStyle(0x3a2a1a, 1).fillEllipse(b.x + 1.5, b.y, 2.6, 9);
  });

  // Chests: wood with iron bands and a gold lock (supply), gold with a gem (elite).
  const chest = (key: string, body: number, band: number, lock: number, edge: number) =>
    make(scene, key, 28, 24, (g) => {
      g.fillStyle(body, 1).lineStyle(2, edge, 1);
      g.fillRoundedRect(2, 3, 24, 19, 3).strokeRoundedRect(2, 3, 24, 19, 3);
      g.fillStyle(shade(body, 1.2), 1).fillRect(3, 4, 22, 5); // lid
      g.fillStyle(band, 1).fillRect(2, 9, 24, 2.5); // lid seam
      g.fillRect(7, 3, 2.5, 19).fillRect(18.5, 3, 2.5, 19); // bands
      g.fillStyle(lock, 1).lineStyle(1, edge, 1);
      g.fillRoundedRect(11, 8, 6, 7, 1.5).strokeRoundedRect(11, 8, 6, 7, 1.5);
      g.fillStyle(edge, 1).fillRect(13.3, 10.5, 1.4, 2.5); // keyhole
    });
  chest(TextureKeys.chestSupply, 0x9c6b3e, 0x4a4f57, 0xf2b632, 0x4a2f18);
  chest(TextureKeys.chestElite, 0xf2b632, 0x8a5a12, 0xb455ff, 0x6b4210);
}

function generateProps(scene: Phaser.Scene): void {
  // Crate: planks with an X brace.
  make(scene, TextureKeys.crate, 32, 32, (g) => {
    g.fillStyle(0x9c6b3e, 1).lineStyle(2, 0x4a2f18, 1);
    g.fillRect(2, 2, 28, 28).strokeRect(2, 2, 28, 28);
    g.lineStyle(1, 0x6e4a2a, 1);
    for (const y of [9, 16, 23]) g.lineBetween(3, y, 29, y);
    g.lineStyle(3, 0x6e4a2a, 1).lineBetween(4, 4, 28, 28).lineBetween(28, 4, 4, 28);
    g.lineStyle(2, 0x4a2f18, 1).strokeRect(4, 4, 24, 24);
  });

  // Powder barrel: dark staves, a bright hoop and a warning sign, so it reads as a hazard.
  make(scene, TextureKeys.powderBarrel, 34, 34, (g) => {
    const c = 17;
    g.fillStyle(0x5a3b26, 1).fillCircle(c, c, 14);
    g.lineStyle(4, 0xffcc33, 1).strokeCircle(c, c, 14);
    g.lineStyle(1, 0x3e2818, 1).strokeCircle(c, c, 9.5);
    g.fillStyle(0xffcc33, 1).fillTriangle(c, c - 8, c + 8, c + 6, c - 8, c + 6);
    g.lineStyle(1.5, 0x2a1a0e, 1).strokeTriangle(c, c - 8, c + 8, c + 6, c - 8, c + 6);
    g.fillStyle(0x2a1a0e, 1)
      .fillRect(c - 1.1, c - 3.5, 2.2, 5.5)
      .fillCircle(c, c + 3.8, 1.2);
  });
}

export function generatePlaceholderTextures(scene: Phaser.Scene, data: GameData): void {
  // The Svan (the gun barrel is drawn on top by Player).
  const pr = u(data.config.player.radius);
  makeBody(scene, TextureKeys.player, 'circle', pr, 0x3d8bfd, 3, 'none', 0x1c4a8c);
  makeShape(scene, TextureKeys.bullet, 'circle', 4, 0xffe066);
  makeShape(scene, TextureKeys.enemyProjectile, 'diamond', 6, 0xb455ff);

  generatePickups(scene);
  generateProps(scene);

  make(scene, TextureKeys.eliteRing, ELITE_RING_RADIUS * 2 + 4, ELITE_RING_RADIUS * 2 + 4, (g) => {
    // Gold outline for elites; scaled to each elite's radius at runtime.
    g.lineStyle(4, 0xf2b632, 1).strokeCircle(ELITE_RING_RADIUS + 2, ELITE_RING_RADIUS + 2, ELITE_RING_RADIUS);
  });

  for (const e of data.enemies) {
    makeBody(scene, TextureKeys.enemy(e.id), e.visual.shape, u(e.radius), hex(e.visual.color), 2, 'eyes');
  }
  // Training Ground dummies are drawn through EnemyView like any enemy, with a target mark.
  for (const dm of data.playground.dummies) {
    makeBody(
      scene,
      TextureKeys.enemy(dm.id),
      dm.visual.shape,
      u(dm.radius),
      hex(dm.visual.color),
      3,
      'target',
    );
  }
  makeBody(
    scene,
    TextureKeys.boss,
    data.boss.visual.shape,
    u(data.boss.radius),
    hex(data.boss.visual.color),
    4,
    'eyes',
  );
}
