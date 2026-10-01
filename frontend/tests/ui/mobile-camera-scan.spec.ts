import { expect, test } from '@playwright/test';
import path from 'node:path';
import { useBooksSession, waitForBooks } from './helpers/session';

// One camera frame: a Code 128 barcode filling the width, as a phone held
// close sees it.
const cameraFeed = path.join(__dirname, 'fixtures/barcode-camera.mjpeg');

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
  launchOptions: {
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${cameraFeed}`,
    ],
  },
});
useBooksSession();

test('the camera reads a barcode that fills the view', async ({ page }) => {
  // iOS Safari has no BarcodeDetector, so decode with the library alone.
  await page.addInitScript(() => delete (window as any).BarcodeDetector);
  // Forms offer scanning only when barcodes are on.
  await page.route(
    '**/api/v2/document/Books%20Inventory%20Settings/**',
    async (route) => {
      const json = await (await route.fetch()).json();
      json.data.enable_barcodes = 1;
      await route.fulfill({ json });
    }
  );
  await page.goto(`/books/edit/SalesInvoice/new-camera-${Date.now()}`);
  await waitForBooks(page);

  await page.getByRole('button', { name: 'Scan barcode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Scan barcode' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeHidden({ timeout: 15000 });
  await expect(page.getByText(/ABC-abc-1234/)).toBeVisible();
});
