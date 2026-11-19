/**
 * M4: the boss at 5:30 with phases and halved spawns, victory and defeat flows, results, pause.
 */
import { expect, test } from '@playwright/test';
import { clickGame, GAME_WIDTH, runState, startRun, trackErrors } from './helpers';

test('the Devi Chieftain comes out at 5:30, spawns halve, phases change, killing it wins', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    window.__svan!.run!.setGodMode(true);
    window.__svan!.run!.spawnBoss();
  });
  await page.waitForFunction(() => window.__svan!.run!.boss() !== null, null, { timeout: 3_000 });
  expect(await page.evaluate(() => window.__svan!.run!.boss())).toMatchObject({ phase: 1, hp: 4000 });
  expect((await runState(page)).maxAlive).toBe(45); // 90 x 0.5 during the boss
  await page.screenshot({ path: test.info().outputPath('boss.png') });

  await page.evaluate(() => window.__svan!.run!.damageBoss(1500));
  await page.waitForFunction(() => window.__svan!.run!.boss()?.phase === 2);
  await page.evaluate(() => window.__svan!.run!.damageBoss(1400));
  await page.waitForFunction(() => window.__svan!.run!.boss()?.phase === 3);

  await page.evaluate(() => window.__svan!.run!.damageBoss(5000));
  await page.waitForFunction(() => window.__svan!.run!.state().result === 'victory', null, {
    timeout: 5_000,
  });
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('results'), null, {
    timeout: 5_000,
  });
  await page.screenshot({ path: test.info().outputPath('results-victory.png') });

  await clickGame(page, 700 + 90, 560); // Retry
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('game'));
  expect(errors).toEqual([]);
});

test('Esc pauses the run; Esc resumes', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('pause'));
  const t0 = (await runState(page)).timeSec;
  await page.waitForTimeout(400);
  expect((await runState(page)).timeSec).toBe(t0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__svan!.activeScenes().includes('pause'));
  await page.waitForTimeout(200);
  expect((await runState(page)).timeSec).toBeGreaterThan(t0);
});

test('losing window focus pauses the run automatically', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('pause'), null, { timeout: 2_000 });
  await clickGame(page, GAME_WIDTH / 2, 330); // Resume
  await page.waitForFunction(() => !window.__svan!.activeScenes().includes('pause'));
});
