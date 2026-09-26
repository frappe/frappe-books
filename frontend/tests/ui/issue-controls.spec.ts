import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, preview, loadConfigFromFile, type PreviewServer } from 'vite';

let server: PreviewServer;
let outputDirectory: string;
let fixtureUrl: string;

test.beforeAll(async () => {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    path.resolve(__dirname, '../../vite.config.ts')
  );
  outputDirectory = await mkdtemp(path.join(tmpdir(), 'books-issue-controls-'));
  const config = {
    ...loaded!.config,
    configFile: false,
    logLevel: 'error' as const,
    build: {
      ...loaded!.config.build,
      outDir: outputDirectory,
      rollupOptions: {
        input: path.resolve(__dirname, 'fixtures/issue-controls.html'),
      },
    },
    preview: { host: '127.0.0.1', port: 0, proxy: {} },
  } as const;
  await build(config);
  server = await preview(config);
  fixtureUrl = `${server.resolvedUrls!.local[0]}tests/ui/fixtures/issue-controls.html`;
});

test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) =>
      server.httpServer.close(() => resolve())
    );
  if (outputDirectory)
    await rm(outputDirectory, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.getByRole('button', { name: 'Before fields' }).waitFor();
});

test('fields retain accessible names when their visual labels are hidden', async ({
  page,
}) => {
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Track item', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Payment method', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Posting date', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Account', exact: true })
  ).toBeVisible();
});

test('Tab reaches checkbox and select and the keyboard changes both values', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Before fields' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('textbox', { name: 'Description' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const checkbox = page.getByRole('checkbox', { name: 'Track item' });
  await expect(checkbox).toBeFocused();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await page.keyboard.press('Tab');
  const select = page.getByRole('combobox', { name: 'Payment method' });
  await expect(select).toBeFocused();
  await select.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'First', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Second', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(select).toContainText('Second');
  await expect(select).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('textbox', { name: 'Posting date' })
  ).toBeFocused();
});

test('select options escape a clipped parent and stay inside the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 400 });
  const select = page.getByRole('combobox', { name: 'Payment method' });
  await select.click();
  const option = page.getByRole('option', { name: 'Third', exact: true });
  await expect(option).toBeVisible();
  const bounds = (await option.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(400);
  await option.click();
  await expect(select).toContainText('Third');
});

test('the hidden sidebar has a visible keyboard-operated restore button', async ({
  page,
}) => {
  const restore = page.getByRole('button', {
    name: 'Show sidebar',
    exact: true,
  });
  await expect(restore).toBeVisible();
  expect(await restore.evaluate((el) => getComputedStyle(el).opacity)).toBe(
    '1'
  );
  await restore.focus();
  await page.keyboard.press('Enter');
  await expect(restore).toBeHidden();
  expect(
    await page.evaluate(() => (window as any).issueFixture.showSidebar.value)
  ).toBe(true);
});
