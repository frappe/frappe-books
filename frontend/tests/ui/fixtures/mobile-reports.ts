import { fyo } from 'src/initFyo';
import 'src/router';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { ProfitAndLoss } from 'reports/ProfitAndLoss/ProfitAndLoss';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { StockBalance } from 'reports/inventory/StockBalance';
import { StockLedger } from 'reports/inventory/StockLedger';
import { TrialBalance } from 'reports/TrialBalance/TrialBalance';
import type { Report } from 'reports/Report';
import {
  toColumnField,
  type ServerColumn,
  type ServerRow,
} from 'reports/serverReport';
import { loadFrappeFixture } from './frappe';
import MobileReport from 'src/components/Report/Mobile/MobileReport.vue';
import { getFilterValues } from 'src/components/Report/Mobile/MobileFilters';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { createApp, h, markRaw, reactive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import 'src/styles/index.css';

// Reports and rows exist only in browser memory, shaped as the server sends them.
function column(
  fieldname: string,
  label: string,
  fieldtype: ServerColumn['fieldtype'] = 'Data'
): ServerColumn {
  return { fieldname, label, fieldtype };
}

async function load(
  report: Report,
  columns: ServerColumn[],
  rows: ServerRow[]
) {
  report.getDefaultFilters = async () => ({});
  report.runReport = async () => ({
    columns: columns.map(toColumnField),
    rows,
  });
  await report.setDefaultFilters();
  report.filters = await report.getFilters();
  await report.setReportData();
  return report;
}

function makeProfitAndLoss() {
  const periods = ['period_2026_08_31', 'period_2026_07_31'];
  const account = (
    name: string,
    indent: number,
    values: number[],
    isGroup = false
  ) => ({
    account: name,
    indent,
    is_group: isGroup,
    ...Object.fromEntries(periods.map((key, i) => [key, values[i]])),
    total: values[0] + values[1],
  });
  return load(
    new ProfitAndLoss(fyo),
    [
      column('account', 'Account', 'Link'),
      column(periods[0], 'Aug 31, 2026', 'Currency'),
      column(periods[1], 'Jul 31, 2026', 'Currency'),
      column('total', 'Total', 'Currency'),
    ],
    [
      account('Income', 0, [123456789, 1000], true),
      account('Direct Income', 1, [123456789, 1000], true),
      account('Sales', 2, [123450000, 1000]),
      account('Implementation & Development Income', 2, [6789, 0]),
      account('Total Income (Credit)', 0, [123456789, 1000]),
      {},
      account('Expenses', 0, [500, 250], true),
      account('Office Rent', 1, [500, 250]),
      account('Total Expense (Debit)', 0, [500, 250]),
      {},
      { ...account('Total Profit', 0, [123456289, 750]), bold: 1 },
    ]
  );
}

function makeGeneralLedger() {
  const entry = (
    index: number,
    date: string,
    debit: number,
    credit: number
  ) => ({
    type: 'entry',
    index,
    account: index % 2 ? 'Debtors' : 'Sales',
    date,
    debit,
    credit,
    balance: debit - credit,
    party: 'Sharma Traders',
    reference_type: 'SalesInvoice',
    reference_name: `SINV-10${index}`,
  });
  return load(
    new GeneralLedger(fyo),
    [
      column('index', '#', 'Int'),
      column('account', 'Account', 'Link'),
      column('date', 'Date', 'Date'),
      column('debit', 'Debit', 'Currency'),
      column('credit', 'Credit', 'Currency'),
      column('balance', 'Balance', 'Currency'),
      column('party', 'Party', 'Link'),
      column('reference_name', 'Ref Name'),
      column('reference_type', 'Ref Type'),
    ],
    [
      { type: 'opening', account: 'Opening', debit: 0, credit: 0, balance: 0 },
      entry(1, '2026-09-27', 32332, 0),
      entry(2, '2026-09-27', 0, 27400),
      entry(3, '2026-09-26', 10000, 0),
      {},
      {
        type: 'closing',
        account: 'Closing',
        debit: 42332,
        credit: 27400,
        balance: 14932,
      },
    ]
  );
}

function makeStockBalance() {
  const rows = [
    ['Printed Brochures (100)', 'Stores', 80, 168000],
    ['Printed Brochures (100)', 'Showroom', 24, 50400],
    ['Business Cards (500)', 'Stores', 190, 133000],
  ] as const;
  return load(
    new StockBalance(fyo),
    [
      column('index', '#', 'Int'),
      column('item', 'Item', 'Link'),
      column('location', 'Location', 'Link'),
      column('balance_quantity', 'Balance Qty.', 'Float'),
      column('balance_value', 'Balance Value', 'Currency'),
    ],
    rows.map(([item, location, quantity, value], index) => ({
      index: index + 1,
      item,
      location,
      balance_quantity: quantity,
      balance_value: value,
    }))
  );
}

function makeStockLedger() {
  const rows = [
    [
      '2026-09-27T10:00:00',
      'Business Cards (500)',
      'Stores',
      -2,
      148,
      'SINV-1015',
    ],
    [
      '2026-09-20T10:00:00',
      'Printed Brochures (100)',
      'Stores',
      40,
      80,
      'PREC-1004',
    ],
  ] as const;
  return load(
    new StockLedger(fyo),
    [
      column('index', '#', 'Int'),
      column('date', 'Date', 'Datetime'),
      column('item', 'Item', 'Link'),
      column('location', 'Location', 'Link'),
      column('quantity', 'Quantity', 'Float'),
      column('balance_quantity', 'Balance Qty.', 'Float'),
      column('reference_name', 'Ref Name'),
      column('reference_type', 'Ref Type'),
    ],
    rows.map(([date, item, location, quantity, balance, name], index) => ({
      index: index + 1,
      date,
      item,
      location,
      quantity,
      balance_quantity: balance,
      reference_name: name,
      reference_type: 'Shipment',
    }))
  );
}

function makeTrialBalance() {
  const keys = [
    'opening_debit',
    'opening_credit',
    'debit',
    'credit',
    'closing_debit',
    'closing_credit',
  ];
  const labels = [
    'Opening (Dr)',
    'Opening (Cr)',
    'Debit',
    'Credit',
    'Closing (Dr)',
    'Closing (Cr)',
  ];
  const values = Object.fromEntries(
    keys.map((key, i) => [key, [0, 0, 1235280, 0, 1235280, 0][i]])
  );
  return load(
    new TrialBalance(fyo),
    [
      column('account', 'Account', 'Link'),
      ...keys.map((key, i) => column(key, labels[i], 'Currency')),
    ],
    [
      {
        account: 'Application of Funds (Assets)',
        indent: 0,
        is_group: true,
        ...values,
      },
      { account: 'Accounts Receivable', indent: 1, is_group: false, ...values },
    ]
  );
}

const makers: Record<string, () => Promise<Report>> = {
  ProfitAndLoss: makeProfitAndLoss,
  GeneralLedger: makeGeneralLedger,
  StockBalance: makeStockBalance,
  StockLedger: makeStockLedger,
  TrialBalance: makeTrialBalance,
};

async function mount() {
  await loadFrappeFixture(() => ({ message: [], data: [] }));
  // The app's documents mark fyo raw; reactive reports rely on it.
  markRaw(fyo);
  fyo.singles.SystemSettings = {
    currency: 'INR',
    locale: 'en-IN',
    display_precision: 2,
    date_format: 'MMM d, y',
  } as any;
  fyo.singles.InventorySettings = {
    enable_batches: false,
    enable_serial_number: false,
  } as any;

  const report = await makeProfitAndLoss();
  const state = reactive({
    report: report as Report,
    defaults: getFilterValues(report),
    loading: false,
  });
  const show = async (name: string) => {
    state.report = await makers[name]();
    state.defaults = getFilterValues(state.report);
  };

  const app = createApp({
    render: () =>
      h(
        FrappeUIProvider,
        {},
        {
          default: () =>
            h('main', { class: 'min-h-screen bg-surface-base' }, [
              h(MobileReport, {
                report: state.report,
                defaults: state.defaults,
                loading: state.loading,
              }),
            ]),
        }
      ),
  });
  app.use(FrappeUI);
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    })
  );
  app.mixin({
    computed: { fyo: () => fyo, platform: () => 'Web' },
    methods: { t: fyo.t, T: fyo.T },
  });
  app.provide(languageDirectionKey, ref('ltr'));
  app.mount('#app');
  (window as any).mobileReportFixture = { state, show };
}

void mount();
