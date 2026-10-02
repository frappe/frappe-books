import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPageCSS } from '../src/utils/printFormats.ts';
import {
  frappeModels,
  fyo,
  getDocType,
  getFrappeDoc,
  getSchema,
  newFrappeDoc,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/frappeModels.mjs';

let respond = () => ({ data: [] });
const requests = await loadFrappeModels(frappeModels, (request) =>
  respond(request)
);

const field = (fieldname) =>
  getSchema('PrintFormat').fields.find((f) => f.fieldname === fieldname);

test("a print template shows Frappe's Print Format as the template it was", () => {
  const schema = getSchema('PrintFormat');
  assert.equal(schema.label, 'Print Template');
  assert.equal(schema.naming, 'manual');
  assert.deepEqual(
    schema.fields
      .filter(({ meta }) => !meta)
      .map(({ fieldname, label, fieldtype }) =>
        [fieldname, label, fieldtype].join(' | ')
      ),
    [
      'name | Template Name | Data',
      'doc_type | Template Type | AutoComplete',
      'disabled | Disabled | Check',
      'standard | Standard | Select',
      'custom_format | Custom Format | Check',
      'html | Template | Text',
      'css | Page Setup | Text',
    ]
  );
  assert.deepEqual(field('doc_type').options.slice(0, 2), [
    { value: 'Books Sales Invoice', label: 'Sales Invoice' },
    { value: 'Books Sales Quote', label: 'Quote' },
  ]);
  assert.equal(field('doc_type').options.length, 8);
  const { columns } = getDocType('PrintFormat').Model.getListViewSettings(fyo);
  assert.deepEqual(
    columns.map((column) => column.fieldname ?? column),
    ['name', 'doc_type', 'standard']
  );
});

test('a new template is a custom sales invoice template on an A4 page, named by the user', async () => {
  respond = ({ body }) => ({ data: { ...body, modified: '2026-10-01' } });
  const template = newFrappeDoc('PrintFormat', { name: 'Receipt' });
  assert.deepEqual(
    [template.doc_type, template.custom_format, template.standard],
    ['Books Sales Invoice', true, 'No']
  );
  assert.equal(template.css, getPageCSS({ width: 21, height: 29.7 }));
  assert.equal(template.isEditable, true);

  requests.length = 0;
  await template.sync();
  assert.equal(requests[0].path, '/api/v2/document/Print Format');
  assert.equal(requests[0].body.name, 'Receipt');
  assert.equal('module' in requests[0].body, false);
});

test('a shipped template is read only, and its duplicate is an editable copy named after it', async () => {
  const shipped = newFrappeDoc('PrintFormat', {
    name: 'Business - Payment',
    doc_type: 'Books Payment',
    standard: 'Yes',
    custom_format: true,
    html: '<p>{{ doc.name }}</p>',
  });
  assert.equal(shipped.isEditable, false);
  assert.equal(shipped.canDelete, false);
  assert.equal(shipped.readOnly.html(), true);

  const copy = await shipped.duplicate();
  assert.deepEqual(
    [copy.name, copy.doc_type, copy.html, copy.standard, copy.isEditable],
    [
      'Business - Payment CPY',
      'Books Payment',
      '<p>{{ doc.name }}</p>',
      'No',
      true,
    ]
  );
});

test('the template list labels each type as its schema and marks custom templates', () => {
  const [, type, custom] =
    getDocType('PrintFormat').Model.getListViewSettings(fyo).columns;
  assert.equal(type.display('Books Payment'), 'Payment');
  assert.equal(custom.display('No'), fyo.format(true, 'Check'));
  assert.equal(custom.display('Yes'), fyo.format(false, 'Check'));
});

test('print template pickers offer the Print Formats of the doctype they print', () => {
  // As the DocFields' link_filters say.
  const linkFilters = (fieldname) =>
    getSchema('Defaults').fields.find((f) => f.fieldname === fieldname)
      .linkFilters;
  const sales = [['doc_type', '=', 'Books Sales Invoice']];
  assert.deepEqual(linkFilters('payment_print_template'), [
    ['doc_type', '=', 'Books Payment'],
  ]);
  assert.deepEqual(linkFilters('pos_print_template'), sales);
  assert.deepEqual(
    frappeModels.POSProfile.filters.pos_print_template(),
    sales
  );
});

test("a settings save first sets the doctypes' print formats through their method", async () => {
  respond = ({ method }) =>
    method === 'GET'
      ? {
          data: {
            name: 'Books Defaults',
            payment_print_template: 'Business - Payment',
            modified: '2026-10-01 10:00:00.000000',
          },
        }
      : { data: { name: 'Books Defaults' }, message: null };
  const defaults = await getFrappeDoc('Defaults', 'Defaults', {
    refresh: true,
  });
  await defaults.set('journal_entry_print_template', 'Ledger Copy');

  requests.length = 0;
  await defaults.sync();
  const [setFormats, save] = requests;

  assert.equal(
    setFormats.path,
    '/api/method/frappe_books.frappe_books.doctype.books_defaults.books_defaults.set_print_formats'
  );
  const { print_formats } = setFormats.body;
  assert.equal(Object.keys(print_formats).length, 8);
  assert.equal(print_formats.journal_entry_print_template, 'Ledger Copy');
  assert.equal(print_formats.payment_print_template, 'Business - Payment');
  assert.equal(print_formats.sales_invoice_print_template, null);
  assert.equal('pos_print_template' in print_formats, false);
  assert.deepEqual(
    [save.method, save.path],
    ['PUT', '/api/v2/document/Books Defaults/Books Defaults']
  );
});

test('a custom template previews its edits for an editor and prints as saved for a reader', async () => {
  respond = () => ({ message: { html: '<p>INV-1</p>', style: '' } });
  const template = newFrappeDoc('PrintFormat', {
    name: 'Receipt',
    doc_type: 'Books Sales Invoice',
    html: '<p>{{ doc.name }}</p>',
  });
  template._notInserted = false;
  const printPath = async (permissions) => {
    template.docPermissions = permissions;
    requests.length = 0;
    await template.getPrint('INV-1');
    return requests[0].path;
  };

  assert.equal(
    await printPath({ read: 1, write: 1 }),
    '/api/method/frappe_books.printing.preview_print_format'
  );
  assert.equal(
    await printPath({ read: 1, print: 1 }),
    '/api/method/frappe.www.printview.get_html_and_style'
  );
});
