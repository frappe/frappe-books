import { createApp, h, reactive, ref } from 'vue';
import { t } from 'fyo';
import { StockLedger } from 'reports/inventory/StockLedger';
import { BalanceSheet } from 'reports/BalanceSheet/BalanceSheet';
import type { Report } from 'reports/Report';
import { toColumnField, type ServerColumn } from 'reports/serverReport';
import ListReport from 'src/components/Report/ListReport.vue';
import { fyo } from 'src/initFyo';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import 'src/styles/index.css';

const itemName = 'Wireless Keyboard with Multi-Device Bluetooth and Number Pad';
const lastItemName =
  'Premium Wireless Keyboard with Multi-Device Bluetooth, Number Pad and Rechargeable Battery';

class OtherReport extends StockLedger {
  static reportName = 'other-report';
}

// The stock ledger columns as its Script Report returns them.
const stockLedgerColumns = (
  [
    ['index', '#', 'Int', 60],
    ['date', 'Date', 'Datetime', 150],
    ['item', 'Item', 'Link'],
    ['location', 'Location', 'Link'],
    ['batch', 'Batch', 'Link'],
    ['serial_number', 'Serial Number', 'Data'],
    ['quantity', 'Quantity', 'Float'],
    ['balance_quantity', 'Balance Qty.', 'Float'],
    ['incoming_rate', 'Incoming rate', 'Currency'],
    ['valuation_rate', 'Valuation Rate', 'Currency'],
    ['balance_value', 'Balance Value', 'Currency'],
    ['value_change', 'Value Change', 'Currency'],
    ['reference_name', 'Ref Name', 'Data'],
    ['reference_type', 'Ref Type', 'Data'],
  ] as const
).map(([fieldname, label, fieldtype, width]) =>
  toColumnField({ fieldname, label, fieldtype, width })
);

// Reports and rows exist only in browser memory. No database calls are needed.
fyo.singles.InventorySettings = {
  enable_batches: true,
  enable_serial_number: true,
} as any;
function makeReport(ReportClass = StockLedger) {
  const report = new ReportClass(fyo);
  report.filters = report.getFilters();
  report.columns = stockLedgerColumns;
  report.reportData = Array.from({ length: 51 }, (_, index) => {
    const values: Record<string, string> = {
      index: String(index + 1),
      date: 'Sep 6, 2026 07:45:32',
      item: index === 50 ? lastItemName : itemName,
      location: 'Retail Floor',
      batch: '',
      serial_number: 'DEMO-SERIAL-WIRELESS-KEYBOARD-000001',
      quantity: '-1.00',
      balance_quantity: '1.00',
      incoming_rate: '1,369.00',
    };
    return {
      cells: report.columns.map((column) => ({
        value: values[column.fieldname] ?? '0.00',
        rawValue: values[column.fieldname],
        align:
          column.fieldtype === 'Float' || column.fieldtype === 'Currency'
            ? ('right' as const)
            : ('left' as const),
        color: column.fieldname === 'quantity' ? ('red' as const) : undefined,
      })),
    };
  });
  return reactive(report);
}

const state = reactive<{ report: Report }>({ report: makeReport() });
const direction = ref<'ltr' | 'rtl'>('ltr');
const app = createApp({
  render: () => h(ListReport, { report: state.report }),
});
app.config.globalProperties.t = t;
app.config.globalProperties.fyo = fyo;
app.provide(languageDirectionKey, direction);
app.mount('#app');

(window as any).reportFixture = {
  state,
  direction,
  itemName,
  lastItemName,
  switchReport: () => {
    state.report = makeReport(OtherReport);
  },
  showBalanceSheet: () => {
    const report = new BalanceSheet(fyo);
    report.columns = [
      { fieldname: 'account', label: 'Account', fieldtype: 'Link', width: 240 },
      ...[
        ['period_2026_08_31', 'Aug 31, 2026'],
        ['period_2026_07_31', 'Jul 31, 2026'],
      ].map(([fieldname, label]) => ({
        fieldname,
        label,
        fieldtype: 'Currency' as const,
        width: 150,
      })),
    ].map((column) => toColumnField(column as ServerColumn));
    report.reportData = [
      {
        cells: report.columns.map((column, index) => ({
          value: index ? '1,000.00' : 'Application of Funds (Assets)',
          rawValue: index ? 1000 : 'Application of Funds (Assets)',
        })),
      },
    ];
    state.report = report;
  },
};
