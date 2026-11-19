import Phaser from 'phaser';
import { Depth } from '../depth';

export const debugMode = new URLSearchParams(window.location.search).has('debug');

/**
 * F3 debug overlay (TDD: Performance > How we check): FPS, alive counts, pool sizes.
 * Shown by default with ?debug=1, which also enables the debug keys listed in it.
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private elapsed = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly collect: () => string[],
  ) {
    this.text = scene.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#d6f5d6',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(Depth.overlay + 1)
      .setVisible(debugMode);
    scene.input.keyboard?.on('keydown-F3', (e: KeyboardEvent) => {
      e.preventDefault();
      this.text.setVisible(!this.text.visible);
    });
  }

  update(dt: number): void {
    if (!this.text.visible) return;
    // Refresh 4 times a second; rebuilding text every frame would cost more than it shows.
    this.elapsed += dt;
    if (this.elapsed < 0.25) return;
    this.elapsed = 0;
    this.text.setText(this.collect());
  }
}
