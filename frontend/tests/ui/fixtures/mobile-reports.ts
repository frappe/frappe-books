import { fyo } from 'src/initFyo';
import 'src/router';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { DateTime } from 'luxon';
import { ProfitAndLoss } from 'reports/ProfitAndLoss/ProfitAndLoss';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { StockBalance } from 'reports/inventory/StockBalance';
import { StockLedger } from 'reports/inventory/StockLedger';
import { TrialBalance } from 'reports/TrialBalance/TrialBalance';
import type { Report } from 'reports/Report';
import type { AccountSection, LedgerRow } from 'reports/types';
import { getSchemas } from 'schemas';
import MobileReport from 'src/components/Report/Mobile/MobileReport.vue';
import { getFilterValues } from 'src/components/Report/Mobile/MobileFilters';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { FrappeDatabaseDemux } from 'src/web/databaseDemux';
import { createApp, h, markRaw, reactive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import 'src/styles/index.css';

// Reports and rows exist only in browser memory. No server calls are needed.
function account(
  name: string,
  level: number,
  values: number[],
  isGroup = false
) {
  return { name, level, isGroup, values };
}

function makeProfitAndLoss() {
  const report = new ProfitAndLoss(fyo);
  report._dateRanges = ['2026-09-01', '2026-08-01'].map((date) => ({
    toDate: DateTime.fromISO(date),
    fromDate: DateTime.fromISO(date).minus({ months: 1 }),
  }));
  report.filters = report.getFilters();
  report.columns = report.getColumns();
  const sections: AccountSection[] = [
    {
      rootType: 'Income',
      accounts: [
        account('Income', 0, [123456789, 1000], true),
        account('Direct Income', 1, [123456789, 1000], true),
        account('Sales', 2, [123450000, 1000]),
        account('Service', 2, [6789, 0]),
      ],
      total: [123456789, 1000],
    },
    {
      rootType: 'Expense',
      accounts: [
        account('Expenses', 0, [500, 250], true),
        account('Office Rent', 1, [500, 250]),
      ],
      total: [500, 250],
    },
  ];
  report.reportData = report.getReportDataFromSections({
    sections,
    profit: [123456289, 750],
  });
  return report;
}

function makeGeneralLedger() {
  const report = new GeneralLedger(fyo);
  report.setDefaultFilters();
  report.filters = report.getFilters();
  report.columns = report.getColumns();
  const entry = (index: number, date: string, debit: number, credit: number) =>
    ({
      type: 'entry',
      index,
      account: index % 2 ? 'Debtors' : 'Sales',
      date,
      debit,
      credit,
      balance: debit - credit,
      party: 'Sharma Traders',
      referenceType: 'SalesInvoice',
      referenceName: `SINV-10${index}`,
    }) as LedgerRow;
  const rows: LedgerRow[] = [
    { type: 'opening', debit: 0, credit: 0, balance: 0 },
    entry(1, '2026-09-27', 32332, 0),
    entry(2, '2026-09-27', 0, 27400),
    entry(3, '2026-09-26', 10000, 0),
    { type: 'blank' },
    { type: 'closing', debit: 42332, credit: 27400, balance: 14932 },
  ];
  report.reportData = rows.map((row) => report._getReportRow(row));
  return report;
}

function makeStockBalance() {
  const report = new StockBalance(fyo);
  report.setDefaultFilters();
  report.filters = report.getFilters();
  report.columns = report.getColumns();
  const rows = [
    ['Printed Brochures (100)', 'Stores', 80, 168000],
    ['Printed Brochures (100)', 'Showroom', 24, 50400],
    ['Business Cards (500)', 'Stores', 190, 133000],
  ] as const;
  report.reportData = rows.map(([item, location, qty, value], index) =>
    report._convertRawDataRowToReportRow(
      {
        name: index + 1,
        item,
        location,
        balanceQuantity: qty,
        balanceValue: value,
      },
      {}
    )
  );
  return report;
}

function makeStockLedger() {
  const report = new StockLedger(fyo);
  report.setDefaultFilters();
  report.filters = report.getFilters();
  report.columns = report.getColumns();
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
  report.reportData = rows.map(
    ([date, item, location, quantity, balanceQuantity, referenceName], index) =>
      report._convertRawDataRowToReportRow(
        {
          name: index + 1,
          date,
          item,
          location,
          quantity,
          balanceQuantity,
          referenceName,
          referenceType: 'Shipment',
        },
        { quantity: null }
      )
  );
  return report;
}

function makeTrialBalance() {
  const report = new TrialBalance(fyo);
  report.filters = report.getFilters();
  report.columns = report.getColumns();
  const values = [0, 0, 1235280, 0, 1235280, 0];
  report.reportData = report.getSectionRows([
    {
      rootType: 'Asset',
      accounts: [
        account('Application of Funds (Assets)', 0, values, true),
        account('Accounts Receivable', 1, values),
      ],
      total: values,
    },
  ]);
  return report;
}

const makers: Record<string, () => Report> = {
  ProfitAndLoss: makeProfitAndLoss,
  GeneralLedger: makeGeneralLedger,
  StockBalance: makeStockBalance,
  StockLedger: makeStockLedger,
  TrialBalance: makeTrialBalance,
};

async function mount() {
  FrappeDatabaseDemux.prototype.getSchemaMap = async () => getSchemas('-', []);
  await fyo.db.init();
  // The app's documents mark fyo raw; reactive reports rely on it.
  markRaw(fyo);
  fyo.singles.SystemSettings = {
    currency: 'INR',
    locale: 'en-IN',
    displayPrecision: 2,
    dateFormat: 'MMM d, y',
  } as any;
  fyo.singles.InventorySettings = {
    enableBatches: false,
    enableSerialNumber: false,
  } as any;

  const state = reactive({
    report: makeProfitAndLoss() as Report,
    defaults: {} as Record<string, unknown>,
    loading: false,
  });
  const show = (name: string) => {
    state.report = makers[name]();
    state.defaults = getFilterValues(state.report);
  };
  show('ProfitAndLoss');

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
