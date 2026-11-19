import { expect, test } from '@playwright/test';
import { clickGame, GAME_WIDTH, trackErrors, waitForBoot } from './helpers';

test('boots to the main menu with valid data and placeholder textures', async ({ page }) => {
  const errors = trackErrors(page);
  await waitForBoot(page);

  const state = await page.evaluate(() => ({
    renderer: window.__svan!.renderer(),
    scenes: window.__svan!.activeScenes(),
    textures: ['tex:player', 'tex:bullet', 'tex:boss', 'tex:enemy:kaji', 'tex:enemy:devi_brute'].map((k) =>
      window.__svan!.textureExists(k),
    ),
  }));

  expect(state.scenes).toEqual(['menu']);
  expect(state.textures.every(Boolean), 'generateTexture placeholders exist').toBe(true);
  // Headless Chromium usually has WebGL via SwiftShader; record what we got either way.
  test.info().annotations.push({ type: 'renderer', description: state.renderer });
  expect(errors).toEqual([]);
});

test('clicking Start begins a run', async ({ page }) => {
  const errors = trackErrors(page);
  await waitForBoot(page);

  await clickGame(page, GAME_WIDTH / 2, 340); // the Start button
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('gunSelect'));
  await page.keyboard.press('1'); // Long Gun
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('game'), null, { timeout: 5_000 });

  expect(await page.evaluate(() => window.__svan!.activeScenes())).toEqual(['game', 'hud']);
  await page.screenshot({ path: test.info().outputPath('run-started.png') });
  expect(errors).toEqual([]);
});

test('quitting a run from the pause menu goes to results, then the menu, and a second run starts', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await waitForBoot(page);
  const scenes = () => page.evaluate(() => window.__svan!.activeScenes());

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('gunSelect'));
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('game'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('pause'));
  await clickGame(page, GAME_WIDTH / 2, 470); // Quit run (below Resume and Settings)
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('results'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('menu'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('gunSelect'));
  await page.keyboard.press('2');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('game'));
  expect(await scenes()).toEqual(['game', 'hud']);

  expect(errors).toEqual([]);
});
