/**
 * T15 stress test (TDD: Performance > How we check): 120 enemies plus constant fire, and the
 * average FPS over 10 s must stay at or above 55.
 *
 * Run locally in a real browser window: `npm run test:perf`. Headless CI machines have no GPU,
 * so their FPS says nothing about the game; this project is not part of CI.
 */
import { expect, test } from '@playwright/test';
import { gamePoint, startRun } from '../e2e/helpers';

const TARGET_ENEMIES = 120;
const SAMPLE_SECONDS = 10;

test('120 enemies and full fire hold 55+ FPS', async ({ page }) => {
  test.setTimeout(60_000);
  await startRun(page, 'scrap_smg');
  await page.evaluate(() => window.__svan!.run!.setGodMode(true));

  const topUp = () =>
    page.evaluate((target) => {
      const run = window.__svan!.run!;
      const missing = target - run.state().enemiesAlive;
      const types = ['kaji', 'ali', 'ochopintre', 'rokapi', 'devi_brute'];
      for (let i = 0; i < missing; i++)
        run.spawnEnemies(types[i % types.length]!, 1, { radius: 8 + (i % 6) });
      return run.state().enemiesAlive;
    }, TARGET_ENEMIES);

  await topUp();
  const aim = await gamePoint(page, 1000, 300);
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.waitForTimeout(1500); // warm-up: let the first frames and JIT settle

  const samples: number[] = [];
  const alive: number[] = [];
  for (let i = 0; i < SAMPLE_SECONDS * 2; i++) {
    alive.push(await topUp());
    await page.waitForTimeout(500);
    samples.push(await page.evaluate(() => window.__svan!.fps()));
  }
  await page.mouse.up();

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const minAlive = Math.min(...alive);
  test.info().annotations.push({
    type: 'fps',
    description: `avg ${avg.toFixed(1)}, min ${Math.min(...samples).toFixed(1)}`,
  });
  console.info(
    `[perf] avg FPS ${avg.toFixed(1)}, min ${Math.min(...samples).toFixed(1)}, min enemies alive ${minAlive}`,
  );
  expect(minAlive).toBeGreaterThanOrEqual(100);
  expect(avg).toBeGreaterThanOrEqual(55);
});
