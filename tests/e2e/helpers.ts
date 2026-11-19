import { expect, type Page } from '@playwright/test';
import type { RunDebugState } from '../../src/debug/testHook';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Collect page errors and console errors; tests assert the list is empty. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

export async function waitForBoot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__svan?.ready === true || window.__svan?.bootError != null, null, {
    timeout: 20_000,
  });
  const bootError = await page.evaluate(() => window.__svan!.bootError);
  expect(bootError, 'game data should validate at boot').toBeNull();
}

/** Screen position of a point in game (logical 1280x720) coordinates, whatever the canvas scale. */
export async function gamePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: box.x + (x / GAME_WIDTH) * box.width, y: box.y + (y / GAME_HEIGHT) * box.height };
}

export async function clickGame(page: Page, x: number, y: number): Promise<void> {
  const p = await gamePoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Boot, then start a run with the given gun through the test hook. */
export async function startRun(page: Page, gunId: string, seed = 1): Promise<void> {
  await waitForBoot(page);
  await page.evaluate(([g, s]) => window.__svan!.startRun(g as string, s as number), [gunId, seed]);
  await page.waitForFunction(() => window.__svan?.run !== undefined);
}

export function runState(page: Page): Promise<RunDebugState> {
  return page.evaluate(() => window.__svan!.run!.state());
}

/** Hold a key for `ms` milliseconds of real time. */
export async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
