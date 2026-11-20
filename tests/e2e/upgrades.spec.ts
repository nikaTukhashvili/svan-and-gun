/**
 * Levelling and the level-up screen: cards, reroll, placing modules (fusion), swapping slots,
 * drops and chests.
 */
import { expect, test, type Page } from '@playwright/test';
import type { RunBuild } from '../../src/systems/build';
import { gamePoint, runState, startRun, trackErrors } from './helpers';

const levelUpOpen = (page: Page) =>
  page.waitForFunction(() => window.__svan!.activeScenes().includes('levelUp'), null, { timeout: 3_000 });
const levelUpClosed = (page: Page) =>
  page.waitForFunction(() => !window.__svan!.activeScenes().includes('levelUp'), null, { timeout: 3_000 });
const picked = (page: Page) => page.evaluate(() => window.__svan!.run!.state().cardsPicked);

/**
 * Take card 1. A module card then asks for a slot: '1' puts it in slot 1, and a replace asks for
 * '1' once more.
 */
async function pickFirst(page: Page): Promise<void> {
  const before = await picked(page);
  for (let i = 0; i < 3 && (await picked(page)) === before; i++) {
    await page.keyboard.press('1');
    await page.waitForTimeout(80);
  }
  expect(await picked(page)).toBe(before + 1);
}

/** Drag with the mouse between two game points, in small steps like a hand would. */
async function dragGame(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await gamePoint(page, from[0], from[1]);
  const b = await gamePoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

/** Centre of barrel (or muzzle) slot `i` on the open level-up screen, in game coordinates. */
async function slotAt(page: Page, i: number, row: 'barrel' | 'muzzle' = 'barrel'): Promise<[number, number]> {
  const s = await page.evaluate(() => window.__svan!.levelUpSlots());
  if (!s) throw new Error('level-up screen is not open');
  return [s[row][i]!, s.y];
}

test('scrap levels the player up; the game pauses for a card; picking one resumes', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => window.__svan!.run!.grantScrap(5));
  await levelUpOpen(page);

  const t0 = (await runState(page)).timeSec;
  await page.waitForTimeout(500);
  expect((await runState(page)).timeSec, 'paused while choosing').toBe(t0);
  await page.screenshot({ path: test.info().outputPath('level-up.png') });

  await pickFirst(page);
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
    await pickFirst(page);
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
  await pickFirst(page);
  await levelUpClosed(page);
});

test('placing a module next to the same one fuses them, with a preview first', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    const b = run.build();
    b.barrel[0] = { id: 'ember_shot', tier: 2 };
    b.barrel[2] = { id: 'thunder_spark', tier: 1 };
    run.setBuild(b);
    run.queueHand([{ type: 'module', modId: 'ember_shot', family: 'element', fuses: true }]);
    run.grantScrap(5);
  });
  await levelUpOpen(page);
  await page.keyboard.press('1'); // the Ember Shot card: now choose a slot
  // Hover slot 2 (between Fire 2 and Thunder 1): the preview shows the cascade.
  const [hx, hy] = await slotAt(page, 1);
  const hover = await gamePoint(page, hx, hy);
  await page.mouse.move(hover.x, hover.y);
  await page.waitForTimeout(150);
  await page.screenshot({ path: test.info().outputPath('fusion-preview.png') });
  await page.mouse.click(hover.x, hover.y);
  await levelUpClosed(page);

  // Fire 1 + Fire 2 → Fire 3, then + Thunder 1 → Plasma 4 in slot 2; slots 1 and 3 freed.
  const build: RunBuild = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.barrel.slice(0, 3)).toEqual([null, { id: 'plasma', tier: 4 }, null]);
  expect(errors).toEqual([]);
});

test('dragging a module card onto a filled slot inserts it; the others slide over', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    const b = run.build();
    b.barrel[0] = { id: 'ember_shot', tier: 1 };
    b.barrel[1] = { id: 'twin_shot', tier: 1 };
    run.setBuild(b);
    run.queueHand([{ type: 'module', modId: 'ricochet', family: 'grey', fuses: false }]);
    run.grantScrap(5);
  });
  await levelUpOpen(page);
  // The single card sits in the middle; drop it on slot 2 (Twin Shot).
  const card = await gamePoint(page, 640, 270);
  const [sx, sy] = await slotAt(page, 1);
  const slot = await gamePoint(page, sx, sy);
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  await page.mouse.move(slot.x, slot.y, { steps: 12 });
  await page.screenshot({ path: test.info().outputPath('drag-preview.png') });
  await page.mouse.up();
  await levelUpClosed(page);
  const build: RunBuild = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.barrel.slice(0, 4)).toEqual([
    { id: 'ember_shot', tier: 1 },
    { id: 'ricochet', tier: 1 },
    { id: 'twin_shot', tier: 1 },
    null,
  ]);
  expect(errors).toEqual([]);
});

test('dragging a card next to the same module merges them, with an animation', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    const b = run.build();
    b.barrel[0] = { id: 'ember_shot', tier: 1 };
    run.setBuild(b);
    run.queueHand([{ type: 'module', modId: 'ember_shot', family: 'element', fuses: true }]);
    run.grantScrap(5);
  });
  await levelUpOpen(page);
  await dragGame(page, [640, 270], await slotAt(page, 1));
  await page.waitForTimeout(120);
  await page.screenshot({ path: test.info().outputPath('merge-animation.png') });
  await levelUpClosed(page);
  const build: RunBuild = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.barrel.slice(0, 2)).toEqual([null, { id: 'ember_shot', tier: 2 }]);
});

test('dragging a module onto another slot swaps them', async ({ page }) => {
  await startRun(page, 'long_gun');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    const b = run.build();
    b.barrel[0] = { id: 'split_shot', tier: 1 };
    b.barrel[1] = { id: 'ricochet', tier: 2 };
    run.setBuild(b);
    run.grantScrap(5);
  });
  await levelUpOpen(page);
  await dragGame(page, await slotAt(page, 0), await slotAt(page, 1));
  const build: RunBuild = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.barrel.slice(0, 2).map((s) => s?.id)).toEqual(['ricochet', 'split_shot']);
});

test('a muzzle card dragged onto the same piece upgrades it', async ({ page }) => {
  const errors = trackErrors(page);
  await startRun(page, 'scrap_smg');
  await page.evaluate(() => {
    const run = window.__svan!.run!;
    const b = run.build();
    b.muzzle[1] = { id: 'compensator', level: 1 };
    run.setBuild(b);
    run.queueHand([{ type: 'muzzle', muzzleId: 'compensator', owned: true }]);
    run.grantScrap(5);
  });
  await levelUpOpen(page);
  await dragGame(page, [640, 270], await slotAt(page, 0)); // onto the barrel: refused, nothing taken
  expect(await picked(page)).toBe(0);
  const card = await gamePoint(page, 640, 270);
  const [mx, my] = await slotAt(page, 1, 'muzzle');
  const target = await gamePoint(page, mx, my);
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.screenshot({ path: test.info().outputPath('muzzle-upgrade-preview.png') });
  await page.mouse.up();
  await levelUpClosed(page);
  const build: RunBuild = await page.evaluate(() => window.__svan!.run!.build());
  expect(build.muzzle).toEqual([null, { id: 'compensator', level: 2 }, null]);
  expect(errors).toEqual([]);
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
  const deadline = Date.now() + 5_000;
  while (choices < 2 && Date.now() < deadline) {
    if (await page.evaluate(() => window.__svan!.activeScenes().includes('levelUp'))) {
      await pickFirst(page);
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
  for (let i = 0; i < 5; i++) await pickFirst(page);
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
    const errors = trackErrors(page);
    await startRun(page, gunId, 3);
    await page.evaluate(() => {
      const run = window.__svan!.run!;
      const b = run.build();
      const mods = [
        { id: 'ember_shot', tier: 3 },
        { id: 'overcharger', tier: 1 },
        { id: 'thunder_spark', tier: 1 },
        { id: 'booster_right', tier: 1 },
        { id: 'plasma', tier: 5 },
        { id: 'twin_shot', tier: 2 },
        { id: 'brace', tier: 1 },
        { id: 'heavy_slug', tier: 1 },
      ];
      b.barrel = b.barrel.map((_, i) => mods[i] ?? null);
      const pieces = [
        { id: 'flared_muzzle', level: 2 },
        { id: 'choke', level: 1 },
        { id: 'wild_muzzle', level: 3 },
      ];
      b.muzzle = b.muzzle.map((_, i) => pieces[i] ?? null);
      run.setBuild(b);
      run.grantScrap(5 + 15 + 25 + 35 + 45 + 55 + 65 + 75 + 85 + 95 + 105 + 115); // all slots open
    });
    await levelUpOpen(page);
    await page.screenshot({ path: test.info().outputPath(`slots-${gunId}.png`) });
    expect(errors).toEqual([]);
  });
}
