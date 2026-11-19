/**
 * M2: enemies spawn on schedule, can be shot, hurt the player, elites and swarm ring events fire.
 */
import { expect, test } from '@playwright/test';
import { gamePoint, runState, startRun, trackErrors } from './helpers';

test('Kaji Imps start spawning off screen and walk in', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.waitForFunction(() => window.__svan!.run!.state().enemiesAlive >= 1, null, { timeout: 5_000 });
  const [first] = await page.evaluate(() => window.__svan!.run!.enemies());
  const s = await runState(page);
  expect(first!.type).toBe('kaji');
  // Spawned on a ring ~23 units out (just off screen); exact placement is unit-tested.
  expect(Math.hypot(first!.x - s.x, first!.y - s.y)).toBeGreaterThan(12);
  expect(errors).toEqual([]);
});

test('shooting kills enemies', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'scrap_smg');
  await page.evaluate(() => window.__svan!.run!.setGodMode(true));
  await page.evaluate(() => window.__svan!.run!.spawnEnemies('kaji', 12, { radius: 6 }));
  const aim = await gamePoint(page, 900, 360); // to the right
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.__svan!.run!.state().kills >= 2, null, { timeout: 6_000 });
  await page.mouse.up();
  await page.screenshot({ path: test.info().outputPath('fight.png') });
  expect(errors).toEqual([]);
});

test('touching enemies hurts the player', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.__svan!.run!.spawnEnemies('kaji', 8, { radius: 2 }));
  await page.waitForFunction(() => window.__svan!.run!.state().hp < 100, null, { timeout: 3_000 });
});

test('Rokapi curses slow the player', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.__svan!.run!.spawnEnemies('rokapi', 6, { radius: 7 }));
  await page.waitForFunction(() => window.__svan!.run!.state().slowed, null, { timeout: 8_000 });
  expect((await runState(page)).hp).toBeLessThan(100);
});

test('the timeline sends an elite at 2:00 and a swarm ring at 3:30', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.__svan!.run!.setGodMode(true));
  await page.evaluate(() => window.__svan!.run!.skipTime(120));
  await page.waitForFunction(
    () => window.__svan!.run!.enemies().some((e) => e.elite && e.type === 'ali'),
    null,
    {
      timeout: 2_000,
    },
  );

  await page.evaluate(() => window.__svan!.run!.killAll());
  await page.evaluate(() => window.__svan!.run!.skipTime(90)); // to 3:30
  await page.waitForFunction(
    () => window.__svan!.run!.enemies().filter((e) => e.type === 'kaji').length >= 20,
    null,
    { timeout: 2_000 },
  );
  await page.screenshot({ path: test.info().outputPath('swarm-ring.png') });
  expect(errors).toEqual([]);
});

test('elites take 5x hits: a fast elite Ali survives a Long Gun shot', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() =>
    window.__svan!.run!.spawnEnemies('ali', 1, { elite: true, trait: 'fast', radius: 8 }),
  );
  const elites = await page.evaluate(() => window.__svan!.run!.enemies().filter((e) => e.elite));
  expect(elites).toHaveLength(1);
  expect(elites[0]!.type).toBe('ali');
  expect(elites[0]!.hp).toBeCloseTo(90, 0); // 18 HP x5 (plus a sliver of per-minute scaling)
  // A 60-damage Long Gun shot (minus 1 elite defence) leaves it standing.
  expect(elites[0]!.hp).toBeGreaterThan(60 - 1);
});
