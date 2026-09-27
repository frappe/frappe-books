import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(path.join(tmpdir(), 'books-accounting-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'accounting.cjs');
const frontend = fileURLToPath(new URL('../..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { Fyo } from './fyo';
      export { getSchemas } from './schemas';
      export { models } from './models';
      export { BalanceSheet } from './reports/BalanceSheet/BalanceSheet';
      export { ProfitAndLoss } from './reports/ProfitAndLoss/ProfitAndLoss';
      export { GeneralLedger } from './reports/GeneralLedger/GeneralLedger';
      export { TrialBalance } from './reports/TrialBalance/TrialBalance';
      export { loadTranslations, useTranslations } from './src/web/translations';
      export { getAccountLabel } from './src/utils/accountLabel';
      export { t, setLanguageMapOnTranslationString } from './fyo/utils/translation';
      export { getJsonData, getCsvData } from './reports/commonExporter';
      export { getDocStatus } from './models/helpers';
      export * from './src/utils/filterQuery';
      export * from './src/utils/filterFields';
      export { getJsonExportData } from './src/utils/export';
      export { getExchangeRate, getItemQtyMap, getMappedDoc, validateQty } from './models/helpers';
      export { getPOSInventory, getPOSBatchQuantity, validatePOSStock } from './models/inventory/posStock';
      export {
        addBatchItem,
        addPOSItem,
        fillRowSerialNumbers,
        setPOSRowQuantity,
        setPOSRowValue,
        validateActiveSerialNumbers,
        validatePOSCheckout,
        validateSinv,
      } from './src/utils/pos';
      export { findScannedPOSItem } from './src/utils/posItemSearch';
      export { getTaskChecks } from './src/utils/getStartedTasks';
      export { getReportCellColorClass } from './src/components/Report/cellColor';
      export { linkOnSave } from './src/utils/doc';
      export { loadListData, onListChange } from './src/utils/listData';
      export { showReport } from './src/utils/misc';
      export { FrappeDatabaseDemux } from './src/web/databaseDemux';
      export { GSTR1 } from './reports/GoodsAndServiceTax/GSTR1';
      export { getGstrJsonData } from './reports/GoodsAndServiceTax/gstExporter';
      export { getPrintTemplatePropValues, getTemplateNameFromFile } from './src/utils/printTemplates';
      export { call } from './src/web/api';
      export * as errors from './fyo/utils/errors';
      export { getInsufficientItems } from './models/inventory/insufficientStock';
      export {
        createMissingBatches,
        getExistingActiveSerialNumbersForItem,
        getSerialNumbersForQuantity,
        getSuggestedBatchName,
      } from './models/inventory/helpers';
      export { getAmountInWords } from './src/utils/amountInWords';
      export { generateCSV, parseCSV } from './utils/csvParser';
      export { Importer, importDoc } from './src/importer';
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
export const {
  Fyo,
  getSchemas,
  models,
  BalanceSheet,
  ProfitAndLoss,
  GeneralLedger,
  TrialBalance,
  loadTranslations,
  useTranslations,
  getAccountLabel,
  t,
  setLanguageMapOnTranslationString,
  getJsonData,
  getCsvData,
  getDocStatus,
  getFilterFields,
  getFieldLabel,
  getJsonExportData,
  FilterSet,
  filterConditions,
  conditionsForField,
  defaultCondition,
  isCompleteFilter,
  mergeQueryFilters,
  getExchangeRate,
  getItemQtyMap,
  getMappedDoc,
  validateQty,
  getPOSInventory,
  getPOSBatchQuantity,
  validatePOSStock,
  setPOSRowQuantity,
  setPOSRowValue,
  validateActiveSerialNumbers,
  findScannedPOSItem,
  validateSinv,
  addBatchItem,
  addPOSItem,
  fillRowSerialNumbers,
  validatePOSCheckout,
  getTaskChecks,
  getReportCellColorClass,
  linkOnSave,
  loadListData,
  onListChange,
  showReport,
  FrappeDatabaseDemux,
  GSTR1,
  getGstrJsonData,
  getPrintTemplatePropValues,
  getTemplateNameFromFile,
  call,
  errors,
  getInsufficientItems,
  createMissingBatches,
  getExistingActiveSerialNumbersForItem,
  getSerialNumbersForQuantity,
  getSuggestedBatchName,
  getAmountInWords,
  generateCSV,
  parseCSV,
  Importer,
  importDoc,
} = createRequire(import.meta.url)(output);

export async function makeFyo() {
  class Store {
    getSchemaMap() {
      return getSchemas('-', []);
    }
    call(method, ...args) {
      // The store holds no documents; a missing one reads as an empty map.
      if (method === 'exists') return false;
      if (method === 'get') return {};
      if (['getAll', 'getAllRaw'].includes(method)) return [];
      // Invoices preview their totals once edits pause; echo the values back.
      if (method === 'preview') return args[1];
      throw new Error(`Unexpected database call: ${method}`);
    }
  }
  const fyo = new Fyo({ DatabaseDemux: Store });
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.AccountingSettings = { enableDiscounting: true };
  fyo.singles.SystemSettings = { currency: 'USD', displayPrecision: 2 };
  return fyo;
}
