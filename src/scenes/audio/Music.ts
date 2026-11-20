/**
 * Background music: one looping track for the whole game for now (public/audio/run.mp3).
 *
 * - Loaded in the background the first time the menu opens, so boot never waits for 5 MB of audio.
 * - One sound object for the whole game (it keeps playing across scene changes).
 * - Volume = settings.musicVolume (0 while settings.musicMuted), under the master volume.
 * - M toggles mute anywhere it is bound (menu and run).
 * - Not played under automated tests (navigator.webdriver), so e2e runs stay light and silent.
 */
import Phaser from 'phaser';
import type { Settings } from '../../systems/save';
import { getSave } from '../meta';

const KEY = 'music_run';
const URL = 'audio/run.mp3';

const automated = (): boolean => typeof navigator !== 'undefined' && navigator.webdriver === true;

function track(game: Phaser.Game): Phaser.Sound.BaseSound | null {
  return game.sound.get(KEY) ?? null;
}

const volumeOf = (s: Settings): number => (s.musicMuted ? 0 : s.musicVolume);

/** Apply the music volume settings to the playing track (if any). */
export function applyMusicVolume(game: Phaser.Game, settings: Settings): void {
  const t = track(game) as (Phaser.Sound.BaseSound & { setVolume?: (v: number) => unknown }) | null;
  t?.setVolume?.(volumeOf(settings));
}

/** Start the music if it is not playing yet: loads it in the background the first time. */
export function startMusic(scene: Phaser.Scene): void {
  if (automated()) return;
  const game = scene.game;
  if (track(game)?.isPlaying) return;
  const play = () => {
    const settings = getSave(scene).state.settings;
    const existing = track(game);
    const t = existing ?? game.sound.add(KEY, { loop: true, volume: volumeOf(settings) });
    const go = () => {
      if (!t.isPlaying) t.play({ loop: true, volume: volumeOf(settings) });
    };
    // Browsers keep audio locked until the first click or key press.
    if (game.sound.locked) game.sound.once(Phaser.Sound.Events.UNLOCKED, go);
    else go();
  };
  if (scene.cache.audio.exists(KEY)) {
    play();
    return;
  }
  scene.load.audio(KEY, URL);
  scene.load.once(Phaser.Loader.Events.COMPLETE, play);
  scene.load.start();
}

/** M: mute or unmute the music, and remember it. */
export function bindMusicKeys(scene: Phaser.Scene): void {
  scene.input.keyboard?.on('keydown-M', () => {
    const save = getSave(scene);
    save.state.settings.musicMuted = !save.state.settings.musicMuted;
    save.save();
    applyMusicVolume(scene.game, save.state.settings);
  });
}
