import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(path.join(tmpdir(), 'books-frappe-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'frappe.cjs');
const frontend = fileURLToPath(new URL('../..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { FrappeDoc } from './src/frappe/document';
      export { registerFrappeModels, isFrappeBacked, getDocType } from './src/frappe/doctypes';
      export { getFrappeDoc, newFrappeDoc } from './src/frappe/documents';
      export { evaluateCondition } from './src/frappe/dependsOn';
      export { getFrappeListPage, toFrappeFilters } from './src/frappe/list';
      export { searchFrappeLink } from './src/frappe/link';
      export { getModel, getSchema, getSearchFields, loadFrappeDocTypes } from './src/frappe/registry';
      export { toSchema } from './src/frappe/schema';
      export { fyo } from './src/initFyo';
      export { getMissingMandatoryFields } from './fyo/model/helpers';
      export { evaluateHidden, evaluateReadOnly, evaluateRequired } from './src/utils/doc';
      export * as errors from './fyo/utils/errors';
      export { frappeModels, models } from './models';
      export { getMappedDoc, getStockTransferActions } from './models/helpers';
      export { getFilterFields } from './src/utils/filterFields';
      export { useBooksDoc } from './src/frappe/useBooksDoc';
    `,
    resolveDir: frontend,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  define: { 'import.meta.env.VITE_ROUTER_BASE': '"/books"' },
  outfile: output,
  plugins: [
    {
      name: 'browser-boundaries',
      setup(builder) {
        builder.onLoad({ filter: /\.vue$/ }, () => ({
          contents: 'export default {}',
        }));
      },
    },
  ],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.css': 'empty' },
});

globalThis.window = {
  location: { hostname: 'books.localhost' },
  frappe: {
    boot: {
      time_zone: { system: 'Asia/Kolkata' },
      user: { name: 'Administrator', roles: ['Books Manager'] },
      books: {
        doctypes: {
          Item: 'Books Item',
          UOMConversionItem: 'Books Uom Conversion Item',
          Account: 'Books Account',
          UOM: 'Books Uom',
          Order: 'Books Order',
        },
      },
    },
  },
};

export const {
  FrappeDoc,
  registerFrappeModels,
  isFrappeBacked,
  getDocType,
  getFrappeDoc,
  newFrappeDoc,
  evaluateCondition,
  getFrappeListPage,
  toFrappeFilters,
  searchFrappeLink,
  getModel,
  getSchema,
  getSearchFields,
  loadFrappeDocTypes,
  toSchema,
  fyo,
  getMissingMandatoryFields,
  evaluateHidden,
  evaluateReadOnly,
  evaluateRequired,
  errors,
  frappeModels,
  models,
  getMappedDoc,
  getStockTransferActions,
  getFilterFields,
  useBooksDoc,
} = createRequire(import.meta.url)(output);

/**
 * Answers every request with `respond({ method, path, params, body })`, which
 * returns a response body, or `{ status, body }` for an error. Records the requests.
 */
export function stubFrappe(respond) {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://books.localhost');
    const request = {
      method: options.method ?? 'GET',
      path: decodeURIComponent(parsed.pathname),
      params: Object.fromEntries(
        [...parsed.searchParams].map(([key, value]) => [key, parseParam(value)])
      ),
      body: JSON.parse(options.body ?? '{}'),
    };
    requests.push(request);
    const answer = await respond(request);
    if (answer?.status) {
      return Response.json(answer.body, { status: answer.status });
    }

    return Response.json(answer ?? {});
  };
  return requests;
}

/** Frappe parses JSON query values; `order_by` stays text. */
function parseParam(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const itemMeta = {
  name: 'Books Item',
  autoname: 'Prompt',
  search_fields: 'item_type, item_usage',
  permissions: [
    { role: 'Books Manager', permlevel: 0, read: 1, write: 1 },
    { role: 'Books Manager', permlevel: 1, read: 1 },
  ],
  fields: [
    {
      fieldname: 'details_section',
      fieldtype: 'Section Break',
      label: 'Details',
    },
    { fieldname: 'image', fieldtype: 'Attach Image', label: 'Image' },
    {
      fieldname: 'item_type',
      fieldtype: 'Select',
      label: 'Type',
      options: 'Product\nService',
      default: 'Product',
      set_only_once: 1,
    },
    { fieldname: 'column', fieldtype: 'Column Break' },
    {
      fieldname: 'rate',
      fieldtype: 'Currency',
      label: 'Rate',
      non_negative: 1,
    },
    {
      fieldname: 'income_account',
      fieldtype: 'Link',
      label: 'Sales Acc.',
      options: 'Books Account',
      reqd: 1,
      placeholder: 'Income',
    },
    {
      fieldname: 'unit',
      fieldtype: 'Link',
      label: 'Unit',
      options: 'Books Uom',
      only_select: 1,
    },
    { fieldname: 'inventory_tab', fieldtype: 'Tab Break', label: 'Inventory' },
    {
      fieldname: 'track_item',
      fieldtype: 'Check',
      label: 'Track Inventory',
      default: '0',
      depends_on:
        "eval:doc.item_type == 'Product' && (doc.__islocal || doc.track_item)",
    },
    {
      fieldname: 'batch_series',
      fieldtype: 'Data',
      label: 'Batch Series',
      read_only_depends_on: 'track_item',
      mandatory_depends_on: 'eval:doc.track_item',
    },
    {
      fieldname: 'secret_code',
      fieldtype: 'Data',
      label: 'Secret',
      permlevel: 1,
    },
    {
      fieldname: 'hidden_code',
      fieldtype: 'Data',
      label: 'Hidden',
      permlevel: 2,
    },
    {
      fieldname: 'released_on',
      fieldtype: 'Datetime',
      label: 'Released',
      no_copy: 1,
    },
    {
      fieldname: 'uom_conversions',
      fieldtype: 'Table',
      label: 'UOM Conversions',
      options: 'Books Uom Conversion Item',
    },
    {
      fieldname: 'custom_books_colour',
      fieldtype: 'Data',
      label: 'Colour',
      is_custom_field: 1,
    },
    {
      fieldname: 'custom_books_shelf',
      fieldtype: 'Data',
      label: 'Shelf',
      is_custom_field: 1,
    },
  ],
};

export const conversionMeta = {
  name: 'Books Uom Conversion Item',
  istable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'uom',
      fieldtype: 'Link',
      label: 'UOM',
      options: 'Books Uom',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'conversion_factor',
      fieldtype: 'Float',
      label: 'Conversion Factor',
      default: '1',
      in_list_view: 1,
    },
  ],
};

export const orderMeta = {
  name: 'Books Order',
  autoname: 'hash',
  is_submittable: 1,
  permissions: [],
  fields: [
    { fieldname: 'customer', fieldtype: 'Data', label: 'Customer', reqd: 1 },
    { fieldname: 'amount', fieldtype: 'Currency', label: 'Amount' },
  ],
};

const bundles = {
  'Books Item': [itemMeta, conversionMeta],
  'Books Order': [orderMeta],
};

/**
 * Registers a test item (prompt named, previewed, with a table and a custom
 * field) and a submittable order, and loads them as the app does at startup.
 */
export async function loadTestDocTypes() {
  class TestItem extends FrappeDoc {
    static doctype = 'Books Item';
    static presentation = {
      label: 'Item',
      nameField: { label: 'Item Name', placeholder: 'Item Name' },
      quickEditFields: ['rate'],
    };
    static previewMethod = 'preview';
  }

  class TestOrder extends FrappeDoc {
    static doctype = 'Books Order';
    static presentation = { label: 'Order' };
  }

  stubFrappe(({ path, params, body }) => {
    if (path.endsWith('getdoctype')) {
      return { docs: bundles[body.doctype] };
    }

    if (path === '/api/v2/document/Books Custom Form') {
      const rows = [
        { fieldname: 'Shelf', section: 'Storage', tab: 'Custom' },
        { fieldname: 'Colour', section: 'Extra', tab: null },
      ];
      const isItem = params.filters[0][2] === 'Item';
      return { data: isItem ? [{ custom_fields: rows }] : [] };
    }
  });
  registerFrappeModels({ Item: TestItem, Order: TestOrder });
  await loadFrappeDocTypes();
  return { TestItem, TestOrder };
}
