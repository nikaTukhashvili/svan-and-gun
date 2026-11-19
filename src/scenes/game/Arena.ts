/**
 * Builds the free roam map (T05): ground, grid, border and obstacles from maps/level1.json.
 * Obstacles get Arcade static bodies for movement collision; the same shapes go into a pure
 * ObstacleField for bullet hit tests.
 */
import Phaser from 'phaser';
import { u } from '../../core/math';
import type { MapDef, ObstacleDef } from '../../data/types';
import { ObstacleField } from '../../systems/obstacles';
import { Depth } from '../depth';

const KIND_COLORS: Record<ObstacleDef['kind'], number> = {
  tower: 0xb8b2a7,
  house: 0x6d5d4b,
  church: 0x8a8f99,
  rock: 0x5a5f66,
  fence: 0x7a5a3a,
};

const GROUND = 0x26332a;
const GRID = 0x2e3d33;
const GRID_STEP_UNITS = 4;
const GROUND_TILE_KEY = 'tex:groundTile';

export interface Arena {
  width: number;
  height: number;
  walls: Phaser.Physics.Arcade.StaticGroup;
  field: ObstacleField;
}

export function buildArena(scene: Phaser.Scene, map: MapDef): Arena {
  const width = u(map.width);
  const height = u(map.height);

  // Ground with a faint grid, so movement reads even on an empty field. One tiled quad: a
  // Graphics this size would be re-tessellated every frame.
  const tile = u(GRID_STEP_UNITS);
  if (!scene.textures.exists(GROUND_TILE_KEY)) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(GROUND, 1).fillRect(0, 0, tile, tile);
    g.lineStyle(1, GRID, 1).lineBetween(0.5, 0, 0.5, tile).lineBetween(0, 0.5, tile, 0.5);
    g.generateTexture(GROUND_TILE_KEY, tile, tile);
    g.destroy();
  }
  scene.add.tileSprite(0, 0, width, height, GROUND_TILE_KEY).setOrigin(0).setDepth(Depth.ground);
  scene.add.graphics().setDepth(Depth.ground).lineStyle(6, 0x14191c, 1).strokeRect(0, 0, width, height);

  const walls = scene.physics.add.staticGroup();
  for (const o of map.obstacles) {
    const color = KIND_COLORS[o.kind];
    const shape =
      o.shape === 'circle'
        ? scene.add.circle(u(o.x), u(o.y), u(o.r), color)
        : scene.add.rectangle(u(o.x), u(o.y), u(o.w), u(o.h), color);
    shape
      .setStrokeStyle(2, Phaser.Display.Color.ValueToColor(color).darken(35).color)
      .setDepth(Depth.obstacles);
    walls.add(shape);
    if (o.shape === 'circle') (shape.body as Phaser.Physics.Arcade.StaticBody).setCircle(u(o.r));
  }

  scene.physics.world.setBounds(0, 0, width, height);
  return { width, height, walls, field: ObstacleField.fromMap(map) };
}
