// @ts-check
const path = require('node:path');
const { test, expect, _electron: electron } = require('@playwright/test');

const ROOT = path.join(__dirname, '../..');

/*
 * Launches the real app once per file and asserts the things unit tests can't:
 * that main.js boots, the preload bridge lands, and the renderer runs to the
 * end of its boot without throwing.
 *
 * LURK_E2E=1 tells main.js to skip the reddit.com cookie warm-up so the suite
 * doesn't depend on the network (see warmCookies).
 */

let app;
let page;
const pageErrors = [];
const consoleErrors = [];

test.beforeAll(async () => {
  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, LURK_E2E: '1' }
  });

  page = await app.firstWindow();
  page.on('pageerror', (err) => pageErrors.push(err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('the main window opens with the right title', async () => {
  await expect(page).toHaveTitle('Lurk');
});

test('the app shell renders', async () => {
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#topbar')).toBeVisible();
  await expect(page.locator('#feed-scroll')).toBeVisible();
  // Built-in feeds are static markup — present regardless of network state.
  await expect(page.locator('.side-item[data-feed=""]')).toContainText('Frontpage');
  await expect(page.locator('.sort-btn')).toHaveCount(4);
});

test('the sidebar collapses and remembers the choice', async () => {
  await expect(page.locator('#sidebar')).toBeVisible();

  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => localStorage.getItem('sidebarCollapsed'))).toBe('1');

  // Ctrl+B is the other way in, and it has to agree with the button.
  await page.keyboard.press('Control+b');
  await expect(page.locator('#sidebar')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sidebarCollapsed'))).toBe('0');
});

test('the renderer boots without throwing', async () => {
  // The helper split across util.js / app.js fails exactly this way: a
  // ReferenceError at boot leaves a blank window and nothing else.
  await page.waitForTimeout(1500);
  expect(pageErrors.map(String)).toEqual([]);
});

test('the preload bridge exposes the expected API', async () => {
  const api = await page.evaluate(() => ({
    keys: Object.keys(window.lurk || {}).sort(),
    updateKeys: Object.keys(window.lurk?.updates || {}).sort(),
    platform: window.lurk?.platform
  }));

  expect(api.keys).toEqual([
    'articlePreviewImage', 'fetchReddit', 'openExternal',
    'platform', 'setBadge', 'setZoom', 'updates', 'zoomBy'
  ]);
  expect(api.updateKeys).toEqual(['check', 'getState', 'install', 'onState', 'openReleasePage']);
  expect(api.platform).toBe(process.platform);
});

test('node internals are not reachable from the renderer', async () => {
  const exposed = await page.evaluate(() => ({
    require: typeof window.require,
    process: typeof window.process,
    module: typeof window.module
  }));
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined' });
});

test('the update IPC round-trips and reports dev mode', async () => {
  const state = await page.evaluate(() => window.lurk.updates.getState());
  // Unpackaged run, so updates must be off — but the channel has to work.
  expect(state.mode).toBe('disabled');
  expect(state.status).toBe('disabled');
  expect(state.current).toMatch(/^\d+\.\d+\.\d+/);
});

test('the sidebar footer shows the running version', async () => {
  const pkg = require(path.join(ROOT, 'package.json'));
  await expect(page.locator('#app-version')).toHaveText(`v${pkg.version}`);
});

test('the update toast stays hidden when there is no update', async () => {
  await expect(page.locator('#update-toast')).toBeHidden();
});

test('a manual check in dev reports that updates are off', async () => {
  await page.locator('#check-updates').click();
  await expect(page.locator('#check-updates')).toHaveText('Updates off in dev');
});

test('the reddit fetch channel rejects an unsafe path', async () => {
  const res = await page.evaluate(() => window.lurk.fetchReddit('//evil.example.com/x'));
  expect(res.ok).toBe(false);
  expect(res.error).toBe('Bad request path');
});

test('the renderer logs no unexpected console errors', async () => {
  // Network failures are legitimate here (the feed can't load with the
  // warm-up skipped); anything else is a real defect.
  const unexpected = consoleErrors.filter(
    (t) => !/net::|Failed to load resource|ERR_|Reddit returned|Network error/i.test(t));
  expect(unexpected).toEqual([]);
});
