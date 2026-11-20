/**
 * Background music. The game skips music under automation (navigator.webdriver) to keep the other
 * specs light; this spec hides that flag so the real path runs: background load, play after the
 * first click, M mutes, the setting is saved.
 */
import { expect, test } from '@playwright/test';
import { clickGame, trackErrors, waitForBoot } from './helpers';

test('the music loads in the background, plays after a click and M mutes it', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await waitForBoot(page);
  await clickGame(page, 640, 40); // a click anywhere unlocks browser audio
  await page.waitForFunction(() => window.__svan!.game.sound.get('music_run')?.isPlaying === true, null, {
    timeout: 20_000,
  });
  const volume = () =>
    page.evaluate(() => (window.__svan!.game.sound.get('music_run') as unknown as { volume: number }).volume);
  expect(await volume()).toBeGreaterThan(0);

  await page.keyboard.press('m');
  await expect.poll(volume).toBe(0);
  expect(await page.evaluate(() => window.__svan!.meta!.state().settings.musicMuted)).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(volume).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
