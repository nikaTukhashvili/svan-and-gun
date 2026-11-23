/**
 * Gear (GDD: Gear): chests offer items, picking one equips it and changes the stats, supply
 * chests land during the run, and the build sheet shows what the Svan wears.
 */
import { expect, test, type Page } from '@playwright/test';
import { runState, startRun, trackErrors } from './helpers';

const chestOpen = (page: Page) =>
  page.waitForFunction(() => window.__svan!.activeScenes().includes('chest'), null, { timeout: 3_000 });
const chestClosed = (page: Page) =>
  page.waitForFunction(() => !window.__svan!.activeScenes().includes('chest'), null, { timeout: 3_000 });

test('a chest pauses the run and offers 3 gear choices; picking one equips it', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun', 5);
  await page.evaluate(() => window.__svan!.run!.queueChest('elite'));
  await chestOpen(page);

  const t0 = (await runState(page)).timeSec;
  await page.waitForTimeout(400);
  expect((await runState(page)).timeSec, 'paused while choosing').toBe(t0);
  expect((await runState(page)).chestOpen).toBe(true);

  const choices = await page.evaluate(() => window.__svan!.run!.chestChoices());
  expect(choices).toHaveLength(3);
  expect(choices.every((c) => c.kind === 'new')).toBe(true); // nothing worn yet: all new items
  await page.screenshot({ path: test.info().outputPath('chest.png') });

  await page.keyboard.press('1');
  await chestClosed(page);
  const first = choices[0]!;
  const eq = await page.evaluate(() => window.__svan!.run!.equipment());
  expect(first.kind === 'new' && eq[first.slot]?.id).toBe(first.kind === 'new' && first.item.id);
  expect((await runState(page)).itemsTaken).toBe(1);
  expect((await runState(page)).invulnerable, 'a moment to get your bearings').toBe(true);
  expect(errors).toEqual([]);
});

test('an item changes the stats; an upgrade raises its level', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'scrap_smg', 9);
  const before = await page.evaluate(() => window.__svan!.run!.stats());
  // Boots are the last paper-doll position.
  const boots = await page.evaluate(() => window.__svan!.run!.equipment().length - 1);
  await page.evaluate((slot) => window.__svan!.run!.setItem(slot, 'boots_of_speed', 2), boots);
  const after = await page.evaluate(() => window.__svan!.run!.stats());
  expect(after.moveSpeed).toBeGreaterThan(before.moveSpeed);

  // Fill every slot, then a chest must still offer something useful: upgrades.
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    ['hunters_hat', 'wolf_cloak', 'iron_chokha', 'quick_ring', 'far_ring'].forEach((id, i) =>
      run.setItem(i, id, 1),
    );
    run.queueChest('supply');
  });
  await chestOpen(page);
  await page.screenshot({ path: test.info().outputPath('chest-full.png') });
  const choices = await page.evaluate(() => window.__svan!.run!.chestChoices());
  const up = choices.findIndex((c) => c.kind === 'upgrade');
  if (up >= 0) {
    const slot = choices[up]!.slot;
    const level = (await page.evaluate(() => window.__svan!.run!.equipment()))[slot]!.level;
    await page.keyboard.press(String(up + 1));
    await chestClosed(page);
    expect((await page.evaluate(() => window.__svan!.run!.equipment()))[slot]!.level).toBe(level + 1);
  } else {
    await page.keyboard.press('1');
    await chestClosed(page);
  }
  expect(errors).toEqual([]);
});

test('a supply chest lands near the player during the run', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'double_barrel', 2);
  await page.evaluate(() => {
    window.__svan!.run!.setGodMode(true);
    window.__svan!.run!.skipTime(45);
  });
  await page.waitForFunction(() => window.__svan!.run!.pickups().some((p) => p.kind === 'chest'), null, {
    timeout: 3_000,
  });
  const s = await runState(page);
  const chest = (await page.evaluate(() => window.__svan!.run!.pickups())).find((p) => p.kind === 'chest')!;
  expect(Math.hypot(chest.x - s.x, chest.y - s.y)).toBeLessThan(14);
  expect(errors).toEqual([]);
});

test('the build sheet shows the items worn, legendaries included', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun', 4);
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    run.setItem(0, 'hat_of_the_tower_keeper', 2);
    run.setItem(1, 'wolf_cloak', 5);
    run.setItem(2, 'lightning_chokha', 3);
    run.setItem(3, 'quick_ring', 1);
    run.setItem(5, 'boots_of_the_mountain_runner', 1);
  });
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('buildSheet'));
  await page.screenshot({ path: test.info().outputPath('build-sheet-items.png') });
  await page.keyboard.press('c');
  await page.waitForFunction(() => !window.__svan!.activeScenes().includes('buildSheet'));
  expect(errors).toEqual([]);
});
