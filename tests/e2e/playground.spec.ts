/**
 * Training Ground (dev tool): opened from the menu, the HTML panel edits the build, dummies
 * soak damage without dying and the DPS meter reads it.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickGame, gamePoint, trackErrors, waitForBoot } from './helpers';

const dps = (page: Page) => page.evaluate(() => window.__svan!.run!.playground!.dps());

async function openFromMenu(page: Page): Promise<void> {
  await waitForBoot(page);
  await clickGame(page, 640, 620); // "Training Ground" on the menu
  await page.waitForFunction(() => window.__svan?.run?.playground !== undefined);
}

test('the menu opens the Training Ground with its panel and dummies', async ({ page }) => {
  const errors = trackErrors(page);
  await openFromMenu(page);
  await expect(page.getByTestId('playground-panel')).toBeVisible();
  const dummies = await page.evaluate(() => window.__svan!.run!.playground!.dummies());
  expect(dummies.length).toBeGreaterThanOrEqual(4);
  expect(dummies.every((d) => d.alive)).toBe(true);
  // No spawn timeline: nothing else shows up.
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => window.__svan!.run!.state());
  expect(s.enemiesAlive).toBe(dummies.length);
  // F2 hides and shows the panel.
  await page.keyboard.press('F2');
  await expect(page.getByTestId('playground-panel')).toBeHidden();
  await page.keyboard.press('F2');
  await expect(page.getByTestId('playground-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shooting the dummy fills the meter; the dummy never dies; reset clears it', async ({ page }) => {
  const errors = trackErrors(page);
  await openFromMenu(page);
  // A panel dropdown changes the build.
  const firstMod = await page.evaluate(
    () =>
      (window.__svan!.game.registry.get('svan:gameData') as { barrelMods: { id: string }[] }).barrelMods[0]!
        .id,
  );
  await page.getByTestId('playground-barrel-0').selectOption(firstMod);
  const build = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.barrel[0]).toEqual({ id: firstMod, tier: 1 });

  // The plain dummy stands straight to the right of the player.
  const aim = await gamePoint(page, 960, 360);
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.__svan!.run!.playground!.dps().total > 0, null, { timeout: 8_000 });
  await page.waitForTimeout(3000);
  await page.mouse.up();

  const s = await dps(page);
  expect(s.total).toBeGreaterThan(0);
  expect(s.hits).toBeGreaterThan(0);
  expect(s.sessionDps).toBeGreaterThan(0);
  const dummies = await page.evaluate(() => window.__svan!.run!.playground!.dummies());
  expect(dummies.every((d) => d.alive)).toBe(true);
  const plain = dummies.find((d) => d.id === 'dummy_plain')!;
  expect(plain.stats.total).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('training-ground.png') });

  await page.getByTestId('playground-reset-meters').click();
  expect((await dps(page)).total).toBe(0);
  await page.getByTestId('playground-reset-build').click();
  const reset = await page.evaluate(() => window.__svan!.run!.build());
  expect(reset.barrel.every((x) => x === null)).toBe(true);
  expect(errors).toEqual([]);
});

test('switching the gun in the panel restarts the Training Ground with that gun', async ({ page }) => {
  await openFromMenu(page);
  await page.getByTestId('playground-gun').selectOption('scrap_smg');
  await page.waitForFunction(() => window.__svan?.run?.state().gunId === 'scrap_smg');
  await page.waitForFunction(() => window.__svan?.run?.playground !== undefined);
  await expect(page.getByTestId('playground-panel')).toHaveCount(1);
});

test('B opens the workbench: drag modules onto the barrel, merge, remove, close', async ({ page }) => {
  const errors = trackErrors(page);
  await openFromMenu(page);
  await page.keyboard.press('b');
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('levelUp'));
  await expect(page.getByTestId('playground-panel')).toBeHidden(); // out of the way of the barrel

  const drag = async (from: [number, number], to: [number, number]) => {
    const a = await gamePoint(page, from[0], from[1]);
    const b = await gamePoint(page, to[0], to[1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(900); // the merge animation
  };
  const barrel = () =>
    page.evaluate(() => window.__svan!.run!.build().barrel.map((s) => (s ? `${s.id}:${s.tier}` : null)));
  const EMBER: [number, number] = [480, 143]; // first chip of the element row
  const slot = (i: number): [number, number] => [118 + i * 132, 585];

  await drag(EMBER, slot(0));
  await drag(EMBER, slot(3)); // not touching: two separate Ember Shots
  expect((await barrel()).slice(0, 4)).toEqual(['ember_shot:1', null, null, 'ember_shot:1']);
  await drag(EMBER, slot(1)); // next to the first one: they merge
  expect((await barrel()).slice(0, 4)).toEqual([null, 'ember_shot:2', null, 'ember_shot:1']);
  await page.screenshot({ path: test.info().outputPath('workbench.png') });
  await drag(slot(3), [640, 300]); // dragged off the barrel: removed
  expect((await barrel())[3]).toBeNull();

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__svan!.activeScenes().includes('levelUp'));
  await expect(page.getByTestId('playground-panel')).toBeVisible();
  expect(errors).toEqual([]);
});
