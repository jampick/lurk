// @ts-check
const { defineConfig } = require('@playwright/test');

/*
 * Electron smoke tests only. There is no web server and no browser project —
 * each test launches the real app through electron.launch().
 */
module.exports = defineConfig({
  testDir: './test/e2e',
  // Electron can only be driven one instance at a time here; parallel workers
  // fight over the single user-data directory.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']]
});
