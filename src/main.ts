import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, UiColors } from './config';
import { installTestHook } from './debug/testHook';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { GunSelectScene } from './scenes/GunSelectScene';
import { HighScoreScene } from './scenes/HighScoreScene';
import { MarketScene } from './scenes/MarketScene';
import { MenuScene } from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { BuildSheetScene } from './scenes/BuildSheetScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultsScene } from './scenes/ResultsScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // WebGL; Canvas is deprecated in Phaser 4 and only a fallback
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: UiColors.background,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // Phaser's delta smoothing lets the game clock drift behind real time when frames are
  // uneven (measured ~16% slow in headless Chrome). The run timer must be accurate (boss at
  // 5:30), so use raw deltas; GameScene clamps each frame to config.combat.maxFrameDeltaMs.
  fps: { smoothStep: false },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  // Later in the list = drawn on top (HUD must come after Game).
  scene: [
    BootScene,
    MenuScene,
    GunSelectScene,
    MarketScene,
    HighScoreScene,
    GameScene,
    HudScene,
    LevelUpScene,
    PauseScene,
    ResultsScene,
    BuildSheetScene,
    SettingsScene, // last: drawn over the pause menu when opened from it
  ],
};

const game = new Phaser.Game(config);
installTestHook(game);
