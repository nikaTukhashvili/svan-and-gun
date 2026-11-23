import type Phaser from 'phaser';
import type { DropsDef } from '../../data/types';
import type { Destructibles } from '../../systems/destructibles';
import { scrapSize, type Pickup, type PickupSystem } from '../../systems/pickups';
import { chestKindOf } from '../../systems/items';
import { Depth } from '../depth';
import { TextureKeys } from '../placeholderTextures';

function textureFor(p: Pickup, drops: DropsDef): string {
  switch (p.kind) {
    case 'scrap': {
      const size = scrapSize(drops, p.value);
      return size === 'large'
        ? TextureKeys.scrapLarge
        : size === 'medium'
          ? TextureKeys.scrapMedium
          : TextureKeys.scrapSmall;
    }
    case 'silver':
      return TextureKeys.silver;
    case 'kubdari':
      return TextureKeys.kubdari;
    case 'horn':
      return TextureKeys.huntingHorn;
    case 'chest':
      return chestKindOf(p.value) === 'elite' ? TextureKeys.chestElite : TextureKeys.chestSupply;
  }
}

/** Sprites for pickups (one per pool slot) and for powder barrels and crates. */
export class PickupView {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly props: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly pickups: PickupSystem,
    private readonly destructibles: Destructibles,
    private readonly drops: DropsDef,
  ) {
    for (let i = 0; i < pickups.capacity; i++) {
      this.images.push(
        scene.add.image(0, 0, TextureKeys.scrapSmall).setVisible(false).setDepth(Depth.pickups),
      );
    }
    for (const d of destructibles.items) {
      this.props.push(
        scene.add
          .image(d.x, d.y, d.kind === 'powderBarrel' ? TextureKeys.powderBarrel : TextureKeys.crate)
          .setDepth(Depth.obstacles + 1),
      );
    }
  }

  sync(timeMs: number): void {
    for (const p of this.pickups.pickups) {
      const img = this.images[p.index]!;
      if (!p.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const tex = textureFor(p, this.drops);
      if (!img.visible || img.texture.key !== tex) img.setTexture(tex).setVisible(true);
      // Gentle bob so pickups read as pickups, not terrain.
      const bob = p.kind === 'scrap' ? 0 : Math.sin(timeMs / 200 + p.index) * 3;
      img.setPosition(p.x, p.y + bob);
    }
    this.destructibles.items.forEach((d, i) => {
      const img = this.props[i]!;
      if (!d.active && img.visible) img.setVisible(false);
    });
  }
}
