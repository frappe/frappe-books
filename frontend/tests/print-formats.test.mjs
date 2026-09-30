import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPageCSS,
  getPageSize,
  getPrintDocument,
  getTemplateNameFromFile,
  setPageSize,
} from '../src/utils/printFormats.ts';

test('a print format page is A4 unless its CSS sets a size', () => {
  assert.deepEqual(getPageSize(undefined), { width: 21, height: 29.7 });
  assert.deepEqual(getPageSize('.books { color: red; }'), {
    width: 21,
    height: 29.7,
  });
  assert.deepEqual(getPageSize(getPageCSS({ width: 8, height: 22 })), {
    width: 8,
    height: 22,
  });
});

test('setting the page size replaces only the page rules', () => {
  const css = `.books { color: red; }\n${getPageCSS({ width: 21, height: 29.7 })}`;

  const resized = setPageSize(css, { width: 8, height: 22 });

  assert.deepEqual(getPageSize(resized), { width: 8, height: 22 });
  assert.match(resized, /^\.books \{ color: red; \}/);
  assert.equal(resized.match(/@page/g).length, 1);
  assert.equal(resized.match(/\.print-format/g).length, 1);
  assert.match(resized, /page-width: 8cm; page-height: 22cm;/);
});

test('a print page wraps the html in the print stylesheet', () => {
  globalThis.window = {
    frappe: {
      boot: {
        lang: 'ar',
        layout_direction: 'rtl',
        books: { print_style: '/assets/frappe/dist/css/print.bundle.css' },
      },
    },
  };

  const page = getPrintDocument({ html: '<p>SINV-1001</p>', style: 'p {}' });

  assert.match(page, /<html lang="ar" dir="rtl">/);
  assert.match(page, /href="\/assets\/frappe\/dist\/css\/print\.bundle\.css"/);
  assert.match(page, /<style>p \{\}<\/style>/);
  assert.match(page, /<div class="print-format"><p>SINV-1001<\/p><\/div>/);
  delete globalThis.window;
});

test('a template file name names the template', () => {
  assert.equal(getTemplateNameFromFile('Invoice.template.html'), 'Invoice');
  assert.equal(getTemplateNameFromFile('Receipt.html'), 'Receipt');
  assert.equal(getTemplateNameFromFile('notes.txt'), null);
});
