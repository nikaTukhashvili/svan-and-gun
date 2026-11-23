/**
 * Twin-stick touch controls (GDD: Controls > Mobile), driven by real multi-touch events through
 * the Chrome DevTools Protocol. `?touch` forces touch mode, as on a phone.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { GAME_WIDTH, gamePoint, runState, trackErrors } from './helpers';

test.use({ hasTouch: true });

type Finger = { id: number; x: number; y: number };

/** Send a touch event; `fingers` are every finger still on the screen, in game coordinates. */
async function touch(
  page: Page,
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  fingers: Finger[],
) {
  const touchPoints = [];
  for (const f of fingers) {
    const p = await gamePoint(page, f.x, f.y);
    touchPoints.push({ x: p.x, y: p.y, id: f.id });
  }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
}

async function tap(page: Page, cdp: CDPSession, x: number, y: number) {
  await touch(page, cdp, 'touchStart', [{ id: 9, x, y }]);
  await page.waitForTimeout(60);
  await touch(page, cdp, 'touchEnd', []);
}

async function startTouchRun(page: Page, gunId: string, seed: number): Promise<CDPSession> {
  await page.goto('/?touch');
  await page.waitForFunction(() => window.__svan?.ready === true, null, { timeout: 20_000 });
  await page.evaluate(([g, s]) => window.__svan!.startRun(g as string, s as number), [gunId, seed]);
  await page.waitForFunction(() => window.__svan?.run !== undefined);
  await page.evaluate(() => window.__svan!.run!.setGodMode(true));
  return page.context().newCDPSession(page);
}

const RELOAD = { x: GAME_WIDTH - 60, y: 340 };
const BUILD = { x: GAME_WIDTH - 60, y: 220 };
const PAUSE = { x: GAME_WIDTH - 60, y: 130 };

test('left thumb moves, right thumb aims and fires, both at once', async ({ page }) => {
  const errors = trackErrors(page);
  const cdp = await startTouchRun(page, 'long_gun', 3);
  const s0 = await runState(page);
  expect(s0.controlMode).toBe('touch');

  // Left thumb lands and pushes right: the player walks right and faces that way.
  await touch(page, cdp, 'touchStart', [{ id: 0, x: 300, y: 500 }]);
  await touch(page, cdp, 'touchMove', [{ id: 0, x: 400, y: 500 }]);
  await page.waitForTimeout(600);
  const s1 = await runState(page);
  expect(s1.x - s0.x, 'walked right').toBeGreaterThan(1);
  expect(Math.abs(s1.y - s0.y)).toBeLessThan(0.3);
  expect(s1.aimAngle).toBeCloseTo(0, 1);
  expect(s1.ammo, 'moving alone does not shoot').toBe(s0.magSize);

  // Right thumb joins and pushes up: aims up and fires while the left thumb keeps walking.
  await touch(page, cdp, 'touchStart', [
    { id: 0, x: 400, y: 500 },
    { id: 1, x: 1000, y: 520 },
  ]);
  await touch(page, cdp, 'touchMove', [
    { id: 0, x: 400, y: 500 },
    { id: 1, x: 1000, y: 420 },
  ]);
  await page.waitForTimeout(700);
  const s2 = await runState(page);
  expect(s2.aimAngle).toBeCloseTo(-Math.PI / 2, 1);
  expect(s2.ammo, 'fired').toBeLessThan(s0.magSize);
  expect(s2.x, 'still walking').toBeGreaterThan(s1.x);
  await page.screenshot({ path: test.info().outputPath('touch-twin-stick.png') });

  // Both thumbs lift: the player stops and the gun stops firing.
  await touch(page, cdp, 'touchEnd', []);
  await page.waitForTimeout(200);
  const s3 = await runState(page);
  await page.waitForTimeout(500);
  const s4 = await runState(page);
  expect(s4.x).toBeCloseTo(s3.x, 1);
  expect(s4.ammo === s3.ammo || s4.reloading || s3.reloading).toBe(true);
  expect(errors).toEqual([]);
});

test('reload, build sheet and pause buttons', async ({ page }) => {
  const errors = trackErrors(page);
  const cdp = await startTouchRun(page, 'scrap_smg', 4);

  // Fire a few rounds with a short push on the aim stick, then tap RELOAD.
  await touch(page, cdp, 'touchStart', [{ id: 1, x: 1000, y: 520 }]);
  await touch(page, cdp, 'touchMove', [{ id: 1, x: 1080, y: 520 }]);
  await page.waitForTimeout(250);
  await touch(page, cdp, 'touchEnd', []);
  expect((await runState(page)).ammo).toBeLessThan((await runState(page)).magSize);
  await tap(page, cdp, RELOAD.x, RELOAD.y);
  await expect.poll(async () => (await runState(page)).reloading).toBe(true);

  await tap(page, cdp, BUILD.x, BUILD.y);
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('buildSheet'), null, {
    timeout: 3_000,
  });
  await page.screenshot({ path: test.info().outputPath('touch-build-sheet.png') });
  // No C or Esc on a phone: the sheet's Close button.
  await tap(page, cdp, 640, 692);
  await page.waitForFunction(() => !window.__svan!.activeScenes().includes('buildSheet'), null, {
    timeout: 3_000,
  });

  await tap(page, cdp, PAUSE.x, PAUSE.y);
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('pause'), null, { timeout: 3_000 });
  expect(errors).toEqual([]);
});

test('Settings > Controls cycles Auto, Touch, Keyboard and is saved', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__svan?.ready === true, null, { timeout: 20_000 });
  await page.evaluate(() => window.__svan!.game.scene.start('settings'));
  await page.waitForFunction(() => window.__svan!.activeScenes().includes('settings'));
  const controls = () => page.evaluate(() => window.__svan!.meta!.state().settings.controls);
  expect(await controls()).toBe('auto');
  const p = await gamePoint(page, 640, 440);
  await page.mouse.click(p.x, p.y);
  expect(await controls()).toBe('touch');
  await page.mouse.click(p.x, p.y);
  expect(await controls()).toBe('keyboard');
  await page.mouse.click(p.x, p.y);
  expect(await controls()).toBe('auto');
  expect(errors).toEqual([]);
});
