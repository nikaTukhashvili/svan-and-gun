/**
 * M5: gun select, market buffs (applied next run, saved), run results saved, settings saved.
 */
import { expect, test } from '@playwright/test';
import { clickGame, GAME_WIDTH, runState, startRun, trackErrors, waitForBoot } from './helpers';

const meta = (page: import('@playwright/test').Page) => page.evaluate(() => window.__svan!.meta!.state());

test('gun select starts a run with the chosen gun', async ({ page }) => {
  const errors = trackErrors(page);
  await waitForBoot(page);
  await clickGame(page, GAME_WIDTH / 2, 340); // Start
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('gunSelect'));
  await page.screenshot({ path: test.info().outputPath('gun-select.png') });
  await page.keyboard.press('3');
  await page.waitForFunction(() => window.__svan!.run !== undefined);
  expect((await runState(page)).gunId).toBe('scrap_smg');
  expect(errors).toEqual([]);
});

test('a market buff is saved, survives a reload, and changes the next run', async ({ page }) => {
  const errors = trackErrors(page);
  await waitForBoot(page);
  await page.evaluate(() => window.__svan!.meta!.setSilver(200));
  await clickGame(page, GAME_WIDTH / 2, 410); // Market
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('market'));
  await clickGame(page, 1020, 123); // Buy, first row: Max HP (50 silver)
  await page.screenshot({ path: test.info().outputPath('market.png') });
  expect(await meta(page)).toMatchObject({ silver: 150, buffLevels: { max_hp: 1 } });

  await page.reload();
  await waitForBoot(page);
  expect(await meta(page)).toMatchObject({ silver: 150, buffLevels: { max_hp: 1 } });
  await startRun(page, 'long_gun');
  expect((await runState(page)).maxHp).toBe(110);
  expect(errors).toEqual([]);
});

test('a finished run saves its high score and silver', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    run.spawnEnemies('kaji', 20, { radius: 6 });
    run.killAll(); // 20 kills = 1 silver
    run.damagePlayer(1000);
  });
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('results'), null, {
    timeout: 4_000,
  });
  const m = await meta(page);
  expect(m.highScores).toHaveLength(1);
  expect(m.highScores[0]).toMatchObject({ gun: 'long_gun', result: 'defeat' });
  expect(m.silver).toBeGreaterThanOrEqual(1);
});

test('settings are saved', async ({ page }) => {
  await waitForBoot(page);
  await clickGame(page, GAME_WIDTH / 2, 550); // Settings
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('settings'));
  await clickGame(page, GAME_WIDTH / 2, 375); // Auto-fire
  expect((await meta(page)).settings.autoFire).toBe(true);
  await page.reload();
  await waitForBoot(page);
  expect((await meta(page)).settings.autoFire).toBe(true);
});
