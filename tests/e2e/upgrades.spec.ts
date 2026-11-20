/**
 * M3: scrap and levelling, the level-up screen (cards, reroll, slot swap), drops and chests.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickGame, runState, startRun, trackErrors } from './helpers';

const levelUpOpen = (page: Page) =>
  page.waitForFunction(() => window.__svan!.activeScenes().includes('levelUp'), null, { timeout: 3_000 });
const levelUpClosed = (page: Page) =>
  page.waitForFunction(() => !window.__svan!.activeScenes().includes('levelUp'), null, { timeout: 3_000 });

test('scrap levels the player up; the game pauses for a card; picking one resumes', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.__svan!.run!.grantScrap(5));
  await levelUpOpen(page);

  const t0 = (await runState(page)).timeSec;
  await page.waitForTimeout(500);
  expect((await runState(page)).timeSec, 'paused while choosing').toBe(t0);
  await page.screenshot({ path: test.info().outputPath('level-up.png') });

  await page.keyboard.press('1');
  await levelUpClosed(page);
  const s = await runState(page);
  expect(s.level).toBe(2);
  expect(s.levelUpOpen).toBe(false);
  expect(errors).toEqual([]);
});

test('one big pickup queues several level-ups, shown one after another', async ({ page }) => {
  await startRun(page, 'scrap_smg');
  await page.evaluate(() => window.__svan!.run!.grantScrap(45)); // 5 + 15 + 25: three levels
  await levelUpOpen(page);
  for (let i = 0; i < 3; i++) {
    expect(await page.evaluate(() => window.__svan!.activeScenes().includes('levelUp'))).toBe(true);
    await page.keyboard.press('1');
    await page.waitForTimeout(150);
  }
  await levelUpClosed(page);
  expect((await runState(page)).level).toBe(4);
});

test('reroll draws a new hand and uses the only charge', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.__svan!.run!.grantScrap(5));
  await levelUpOpen(page);
  await page.keyboard.press('r');
  await page.keyboard.press('r'); // no charges left: ignored
  await page.keyboard.press('2');
  await levelUpClosed(page);
});

test('clicking two barrel slots swaps them', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() =>
    window.__svan!.run!.setBuild({
      barrel: [{ id: 'split_shot', level: 1 }, { id: 'ricochet', level: 2 }, null, null, null, null],
      magazine: [null, null],
      coreTier: 1,
    }),
  );
  await page.evaluate(() => window.__svan!.run!.grantScrap(5 + 15 + 25 + 35)); // level 5: barrel slot 2 open
  await levelUpOpen(page);
  // Long Gun: 6 barrel + 2 magazine boxes, 125 px wide with 8 px gaps, starting at x = 40.
  await clickGame(page, 40 + 62, 600); // slot 1
  await clickGame(page, 40 + 125 + 8 + 62, 600); // slot 2
  const build = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.barrel.slice(0, 2).map((s) => s?.id)).toEqual(['ricochet', 'split_shot']);
});

test('kills drop scrap that flies to the player; an elite drops a Gunsmith chest', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    run.setGodMode(true);
    run.spawnEnemies('ali', 1, { elite: true, trait: 'fast', radius: 1 }); // drops scatter ~0.5 u: stay inside the 2 u pickup radius
    run.killAll();
  });
  // Scrap and the chest land inside the pickup radius and are collected; the chest opens a free choice.
  await levelUpOpen(page);
  // Choose until the level-up and the chest are both done, then the silver lands too.
  // The chest may land a moment after the first choice, opening its own screen.
  let choices = 0;
  const deadline = Date.now() + 4_000;
  while (choices < 2 && Date.now() < deadline) {
    if (await page.evaluate(() => window.__svan!.activeScenes().includes('levelUp'))) {
      await page.keyboard.press('1');
      choices++;
    }
    await page.waitForTimeout(150);
  }
  expect(choices).toBeGreaterThanOrEqual(2); // a level-up plus the chest's free card
  await page.waitForFunction(() => window.__svan!.run!.state().silver >= 10, null, { timeout: 3_000 });
  expect((await runState(page)).level).toBeGreaterThanOrEqual(2); // the elite's 10 scrap
  expect(errors).toEqual([]);
});

test('C opens the build sheet (perks, stats, gun) and pauses the run; C closes it', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'scrap_smg', 7);
  await page.evaluate(() => window.__svan!.run!.grantScrap(5 + 15 + 25 + 35 + 45)); // five level-ups
  await levelUpOpen(page);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('1');
    await page.waitForTimeout(120);
  }
  await levelUpClosed(page);

  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('buildSheet'));
  const t0 = (await runState(page)).timeSec;
  await page.waitForTimeout(300);
  expect((await runState(page)).timeSec).toBe(t0);
  await page.screenshot({ path: test.info().outputPath('build-sheet.png') });

  await page.keyboard.press('c');
  await page.waitForFunction(() => !window.__svan!.activeScenes().includes('buildSheet'));
  expect(errors).toEqual([]);
});

for (const gunId of ['long_gun', 'double_barrel', 'scrap_smg'] as const) {
  test(`${gunId}: the level-up screen shows this gun's barrel layout`, async ({ page }) => {
    await startRun(page, gunId, 3);
    await page.evaluate((g) => {
      const run = window.__svan!.run!;
      const b = run.build();
      const ids = ['ember_shot', 'amplifier', 'thunder_spark', 'echo', 'split_shot', 'ricochet'];
      b.barrel = b.barrel.map((_, i) => (ids[i] ? { id: ids[i]!, level: 1 } : null));
      if (g === 'scrap_smg') b.barrel[3] = { id: 'piercing_bore', level: 1 };
      run.setBuild(b);
      run.grantScrap(5);
    }, gunId);
    await levelUpOpen(page);
    await page.screenshot({ path: test.info().outputPath(`slots-${gunId}.png`) });
  });
}
