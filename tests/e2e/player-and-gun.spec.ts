/**
 * M1: arena, movement, aim and shooting, ammo and reload, the three cores, player HP.
 * Uses real keyboard and mouse input; numbers have slack for headless frame timing.
 */
import { expect, test } from '@playwright/test';
import { gamePoint, holdKey, runState, startRun, trackErrors } from './helpers';

test('WASD moves the player', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  const before = await runState(page);
  await holdKey(page, 'd', 600);
  const after = await runState(page);
  // 5 units/s for 0.6 s = 3 units; allow for frame timing.
  expect(after.x - before.x).toBeGreaterThan(1.5);
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.2);
  expect(errors).toEqual([]);
});

test('obstacles block movement: walking north stops at the tower', async ({ page }) => {
  await startRun(page, 'long_gun');
  // Start (80, 58); the tower is a circle at (80, 45) with radius 2.5, the player radius is 0.45.
  await holdKey(page, 'w', 3000);
  const s = await runState(page);
  expect(s.y).toBeLessThan(52); // it did walk
  expect(s.y).toBeGreaterThan(45 + 2.5 + 0.45 - 0.15); // but not into the tower
  await page.screenshot({ path: test.info().outputPath('at-tower.png') });
});

for (const gun of ['long_gun', 'double_barrel', 'scrap_smg'] as const) {
  test(`${gun}: holding the mouse shoots and uses ammo`, async ({ page }) => {
    const errors = trackErrors(page);
    await startRun(page, gun);
    const aim = await gamePoint(page, 1100, 360); // to the right of the player
    await page.mouse.move(aim.x, aim.y);
    await page.mouse.down();
    // Double Barrel pellets live ~0.23 s, so poll rather than sample once.
    await page.waitForFunction(() => window.__svan!.run!.state().bulletsActive > 0, null, { timeout: 2_000 });
    await page.waitForTimeout(1000);
    await page.mouse.up();
    const end = await runState(page);

    expect(end.ammo < end.magSize || end.reloading, 'ammo used').toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Double Barrel empties both barrels, then reloads automatically', async ({ page }) => {
  await startRun(page, 'double_barrel');
  const aim = await gamePoint(page, 1100, 360);
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const s = await runState(page);
  expect(s.ammo).toBe(0);
  expect(s.reloading).toBe(true);
  await page.waitForTimeout(1900); // 1.6 s reload
  expect((await runState(page)).ammo).toBe(2);
});

test('R reloads a partly used magazine', async ({ page }) => {
  await startRun(page, 'scrap_smg');
  const aim = await gamePoint(page, 1100, 360);
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect((await runState(page)).ammo).toBeLessThan(30);
  await page.keyboard.press('r');
  expect((await runState(page)).reloading).toBe(true);
  await page.waitForTimeout(2100); // 1.8 s reload
  const s = await runState(page);
  expect(s.reloading).toBe(false);
  expect(s.ammo).toBe(30);
});

test('hits respect invulnerability, and 0 HP ends the run', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');

  const taken = await page.evaluate(() => [
    window.__svan!.run!.damagePlayer(10),
    window.__svan!.run!.damagePlayer(10),
  ]);
  expect(taken).toEqual([10, 0]); // the second hit lands inside the 0.5 s window
  expect((await runState(page)).hp).toBe(90);

  await page.waitForTimeout(700);
  await page.evaluate(() => window.__svan!.run!.damagePlayer(10));
  expect((await runState(page)).hp).toBe(80);

  await page.waitForTimeout(700);
  await page.evaluate(() => window.__svan!.run!.damagePlayer(500));
  const s = await runState(page);
  expect(s).toMatchObject({ hp: 0, ended: true, result: 'defeat' });

  await page.waitForFunction(() => window.__svan!.activeScenes().includes('results'), null, {
    timeout: 4_000,
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('menu'));
  expect(errors).toEqual([]);
});
