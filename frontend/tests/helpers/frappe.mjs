import { after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
      export { getFrappeDoc, getFrappeDocOrNew, getMappedFrappeDoc, newFrappeDoc } from './src/frappe/documents';
      export { useBooksDoc } from './src/frappe/useBooksDoc';
      export { evaluateCondition } from './src/frappe/dependsOn';
      export { getFrappeListPage, getFrappeRows, isSortableField } from './src/frappe/list';
      export { getLinkDisplayValue, searchFrappeLink } from './src/frappe/link';
      export { loadListData, onListChange } from './src/utils/listData';
      export { getModel, getQuickViewFields, getSchema, getSearchFields, getSingleSchemaNames, loadFrappeDocTypes, toSchemaName } from './src/frappe/registry';
      export { toSchema } from './src/frappe/schema';
      export { fyo } from './src/initFyo';
      export { setLanguageMapOnTranslationString } from './fyo/utils/translation';
      export { getMissingMandatoryFields } from './fyo/model/helpers';
      export { evaluateHidden, evaluateReadOnly, evaluateRequired, loadDocPermissions } from './src/utils/doc';
      export { getRowDetails } from './src/components/Controls/rowDetails';
      export { getRowSummary } from './src/components/Controls/rowSummary';
      export * as errors from './fyo/utils/errors';
      export { frappeModels, getRegionalFrappeModels } from './models';
      export { getLedgerLink, getMappedDoc, getStockTransferActions } from './models/helpers';
      export { createFilters, routeFilters } from './src/utils/filters';
      export { getNewDocValues } from './src/utils/misc';
      export { getFilterFields } from './src/utils/filterFields';
      export { getSidebarConfig } from './src/utils/sidebarConfig';
      export { default as ListView } from './src/pages/ListView/ListView.vue';
      export { default as router } from 'src/router';
      export { ListFilters } from './src/utils/listFilters';
      export * as pos from './src/utils/pos';
      export * as posSetup from './src/utils/posSetup';
      export * as posStock from './models/inventory/posStock';
      export * as posItemSearch from './src/utils/posItemSearch';
      export { getInsufficientItems } from './models/inventory/insufficientStock';
      export { Search } from './src/utils/search';
      export { useSearch } from './src/utils/useSearch';
      export { searcherKey } from './src/utils/injectionKeys';
      export { createApp, effectScope, shallowRef } from 'vue';
      export { GeneralLedger } from './reports/GeneralLedger/GeneralLedger';
      export { ProfitAndLoss } from './reports/ProfitAndLoss/ProfitAndLoss';
      export { StockBalance } from './reports/inventory/StockBalance';
      export { MobileTree } from './src/components/Report/Mobile/MobileTree';
      export { getCsvData, getJsonData } from './reports/commonExporter';
      export { getRowReference } from './src/components/Report/Mobile/mobileRows';
      export { Importer, getGridRows, getImportableSchemaNames } from './src/importer';
      export {
        getCsvExportData,
        getExportFields,
        getExportTableFields,
        getJsonExportData,
      } from './src/utils/export';
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
        builder.onResolve({ filter: /^src\/router$/ }, () => ({
          path: 'router',
          namespace: 'stub',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export default {}',
        }));
        // Components under test keep their script; the rest are stubs.
        builder.onLoad(
          { filter: /ListView\/ListView\.vue$/ },
          async (args) => ({
            contents: (await readFile(args.path, 'utf8')).match(
              /<script[^>]*>([\s\S]*?)<\/script>/
            )[1],
            loader: 'ts',
          })
        );
        builder.onLoad({ filter: /\.vue$/ }, () => ({
          contents: 'export default {}',
        }));
      },
    },
  ],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.css': 'empty' },
});

globalThis.history = { state: null };
globalThis.window = {
  location: { hostname: 'books.localhost' },
  frappe: {
    boot: {
      time_zone: { system: 'Asia/Kolkata' },
      user: { name: 'Administrator', roles: ['Books Manager'] },
      books: {},
    },
  },
};

export const {
  FrappeDoc,
  registerFrappeModels,
  isFrappeBacked,
  getDocType,
  getFrappeDoc,
  getFrappeDocOrNew,
  getMappedFrappeDoc,
  newFrappeDoc,
  useBooksDoc,
  evaluateCondition,
  getFrappeListPage,
  getFrappeRows,
  isSortableField,
  searchFrappeLink,
  getLinkDisplayValue,
  loadListData,
  onListChange,
  getModel,
  getQuickViewFields,
  getSchema,
  getSearchFields,
  getSingleSchemaNames,
  loadFrappeDocTypes,
  toSchemaName,
  toSchema,
  fyo,
  setLanguageMapOnTranslationString,
  getMissingMandatoryFields,
  evaluateHidden,
  evaluateReadOnly,
  evaluateRequired,
  loadDocPermissions,
  getRowDetails,
  getRowSummary,
  errors,
  frappeModels,
  getRegionalFrappeModels,
  getMappedDoc,
  createFilters,
  routeFilters,
  getNewDocValues,
  getStockTransferActions,
  getFilterFields,
  ListFilters,
  pos,
  posSetup,
  posStock,
  posItemSearch,
  getInsufficientItems,
  Search,
  useSearch,
  searcherKey,
  createApp,
  effectScope,
  shallowRef,
  GeneralLedger,
  ProfitAndLoss,
  StockBalance,
  MobileTree,
  getCsvData,
  getJsonData,
  getRowReference,
  getLedgerLink,
  Importer,
  getGridRows,
  getImportableSchemaNames,
  getCsvExportData,
  getExportFields,
  getExportTableFields,
  getJsonExportData,
  getSidebarConfig,
  ListView,
  router,
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

const accountMeta = {
  name: 'Books Account',
  autoname: 'Prompt',
  permissions: [],
  fields: [],
};

const bundles = {
  'Books Account': [accountMeta],
  'Books Item': [itemMeta, conversionMeta],
  'Books Order': [orderMeta],
};

/**
 * Registers a test item (prompt named, previewed, with a table and a custom
 * field) and a submittable order, and loads them as the app does at startup.
 */
export async function loadTestDocTypes() {
  class TestConversion extends FrappeDoc {
    static presentation = { label: '', fields: { uom: { create: false } } };
  }

  class TestItem extends FrappeDoc {
    static doctype = 'Books Item';
    static presentation = {
      label: 'Item',
      nameField: { label: 'Item Name', placeholder: 'Item Name' },
      quickEditFields: ['rate'],
      fields: { unit: { create: false } },
    };
    static previewMethod = 'preview';
    static rowModels = { uom_conversions: TestConversion };
  }

  class TestOrder extends FrappeDoc {
    static doctype = 'Books Order';
    static presentation = { label: 'Order' };
  }

  class TestAccount extends FrappeDoc {
    static doctype = 'Books Account';
    static presentation = { label: 'Account' };
  }

  stubFrappe(({ body }) => {
    const metas = body.doctypes.flatMap((doctype) => bundles[doctype]);
    const item = {
      custom_books_shelf: {
        section: 'Storage',
        tab: 'Custom',
        books_fieldname: 'shelf',
      },
      custom_books_colour: {
        section: 'Extra',
        tab: null,
        books_fieldname: 'colour',
      },
    };
    return {
      message: {
        metas: [...new Set(metas)],
        placements: { 'Books Item': item },
      },
    };
  });
  registerFrappeModels({
    Account: TestAccount,
    Item: TestItem,
    Order: TestOrder,
  });
  await loadFrappeDocTypes();
  return { TestItem, TestOrder };
}
