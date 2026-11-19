import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    // Local only (npm run test:perf, headed): FPS in headless CI says nothing about real hardware.
    {
      name: 'perf',
      testDir: 'tests/perf',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  // The dev server is used because the window.__svan test hook exists only in dev/test builds.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
