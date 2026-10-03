import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deskTheme,
  docsPathRef,
  getAppMenuItems,
  getColorScheme,
  stubFrappe,
} from './helpers/frappe.mjs';

const getThemeMenu = () =>
  getAppMenuItems()
    .flatMap(({ options }) => options)
    .find(({ label }) => label === 'Theme');

test("the account menu sets the user's own Frappe desk theme", async () => {
  const requests = stubFrappe(() => ({ message: null }));
  deskTheme.value = 'Automatic';
  const themes = getThemeMenu().submenu;
  assert.deepEqual(
    themes.map(({ label, selected }) => [label, selected]),
    [
      ['Light', false],
      ['Dark', false],
      ['Automatic', true],
    ]
  );

  await themes[1].onClick();

  assert.equal(deskTheme.value, 'Dark');
  assert.deepEqual(
    requests.map(({ path, body }) => [path, body]),
    [
      [
        '/api/method/frappe.core.doctype.user.user.switch_theme',
        { theme: 'Dark' },
      ],
    ]
  );
  assert.equal(getThemeMenu().submenu[1].selected, true);
});

test('the desk theme paints the app; Automatic follows the system', () => {
  assert.deepEqual(
    ['Light', 'Dark', 'Automatic', undefined].map(getColorScheme),
    ['light', 'dark', 'system', 'light']
  );
});

test('Documentation opens the Books docs on a page that has none of its own', () => {
  const opened = [];
  globalThis.window.open = (url) => opened.push(url);
  const documentation = getAppMenuItems()
    .flatMap(({ options }) => options)
    .find(({ label }) => label === 'Documentation');

  docsPathRef.value = '';
  documentation.onClick();
  docsPathRef.value = 'books/sales-invoices';
  documentation.onClick();

  assert.deepEqual(opened, [
    'https://docs.frappe.io/books',
    'https://docs.frappe.io/books/sales-invoices',
  ]);
});
