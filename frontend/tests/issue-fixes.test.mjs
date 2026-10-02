import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frappeModels,
  makeFyo,
  GeneralLedger,
  TrialBalance,
  useTranslations,
  t,
  setLanguageMapOnTranslationString,
} from './helpers/accounting.mjs';
import { reportResult, stubServer } from './helpers/server.mjs';

test('trial balance sends its dates as they are and renders six amounts', async () => {
  const fyo = await makeFyo();
  const report = new TrialBalance(fyo);
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  report.filters = report.getFilters();
  const amounts = ['opening_debit', 'opening_credit', 'debit', 'credit'];
  const calls = stubServer(() =>
    reportResult(
      [
        ['account', 'Link', 240],
        ...amounts.map((key) => [key, 'Currency', 150]),
      ],
      [
        {
          account: 'Cash',
          indent: 0,
          is_group: false,
          opening_debit: 80,
          opening_credit: 0,
          debit: 50,
          credit: 30,
        },
      ]
    )
  );
  await report.setReportData();
  assert.deepEqual(calls[0].args.filters, {
    from_date: '2026-01-01',
    to_date: '2026-01-31',
    hide_group_amounts: false,
  });
  assert.deepEqual(
    report.reportData.map((row) => row.cells.map((cell) => cell.rawValue)),
    [['Cash', 80, 0, 50, 30]]
  );
  assert.deepEqual(
    report.columns.map((column) => column.width),
    [2, 1.25, 1.25, 1.25, 1.25]
  );
});

test('general ledger runs its Script Report and styles the server rows', async (t) => {
  const fyo = await makeFyo();
  const report = new GeneralLedger(fyo);
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  report.account = 'Cash';
  report.ascending = true;
  report.filters = report.getFilters();
  const calls = stubServer(() =>
    reportResult(
      [
        ['index', 'Int', 60],
        ['account', 'Link', 180],
        ['date', 'Date'],
        ['debit', 'Currency', 150],
        ['credit', 'Currency', 150],
        ['balance', 'Currency', 150],
        ['reference_type', 'Data'],
      ],
      [
        {
          type: 'opening',
          account: 'Opening',
          debit: 0,
          credit: 0,
          balance: 100,
        },
        {
          type: 'entry',
          index: 1,
          account: 'Cash',
          date: '2026-01-01',
          debit: 50,
          credit: 0,
          balance: 150,
          reference_type: 'Books Journal Entry',
        },
        {},
        {
          type: 'closing',
          account: 'Closing',
          debit: 50,
          credit: 0,
          balance: 150,
        },
      ]
    )
  );
  window.frappe = { boot: {} };
  t.after(() => delete window.frappe);
  await report.setReportData();
  const [{ method, args }] = calls;
  assert.equal(method, 'frappe.desk.query_report.run');
  assert.equal(args.report_name, 'Books General Ledger');
  assert.equal(args.filters.account, 'Cash');
  assert.equal(args.filters.from_date, '2026-01-01');
  assert.equal(args.filters.ascending, true);
  assert.equal(args.filters.reverted, false);
  assert.deepEqual(
    report.columns.map((c) => [c.fieldname, c.align, c.width]),
    [
      ['index', 'right', 0.5],
      ['account', 'left', 1.5],
      ['date', 'left', 1],
      ['debit', 'right', 1.25],
      ['credit', 'right', 1.25],
      ['balance', 'right', 1.25],
      ['reference_type', 'left', 1],
    ]
  );
  const cell = (row, fieldname) =>
    row.cells[report.columns.findIndex((c) => c.fieldname === fieldname)];
  const [opening, entry, blank, closing] = report.reportData;
  assert.equal(cell(opening, 'account').value, 'Opening');
  assert.equal(cell(opening, 'balance').rawValue, 100);
  assert.equal(cell(opening, 'account').italics, true);
  assert.equal(cell(entry, 'index').value, '1');
  assert.equal(cell(entry, 'reference_type').rawValue, 'Books Journal Entry');
  assert.equal(blank.isEmpty, true);
  assert.equal(cell(closing, 'account').value, 'Closing');
  assert.equal(cell(closing, 'balance').bold, true);
});

test('general ledger opens with the dates the server picks', async () => {
  const report = new GeneralLedger(await makeFyo());
  const calls = stubServer(() => ({
    from_date: '2025-09-28',
    to_date: '2026-09-28',
  }));
  await report.setDefaultFilters();
  await report.setDefaultFilters();
  assert.deepEqual(
    calls.map((c) => c.args),
    [{ report_name: 'Books General Ledger' }]
  );
  assert.equal(report.fromDate, '2025-09-28');
  assert.equal(report.toDate, '2026-09-28');
});

// The server's preview picks a country's chart; see test_books_setup_wizard.py.
test('the setup wizard offers the charts the server lists', async () => {
  const fyo = await makeFyo();
  const swiss = 'Switzerland - General Chart of Accounts';
  fyo.store.chartsOfAccounts = [
    { ...chart('Standard Chart of Accounts', ''), label: 'Plan standard' },
    chart(swiss, 'ch'),
  ];

  assert.deepEqual(frappeModels.SetupWizard.lists.chart_of_accounts({ fyo }), [
    { value: 'Standard Chart of Accounts', label: 'Plan standard' },
    { value: swiss, label: swiss },
  ]);
});

function chart(name, countryCode, language = null) {
  return { name, label: name, country_code: countryCode, language };
}

test('translations fill template values and skip empty ones', () => {
  try {
    useTranslations({ 'Amount {0}': 'Montant {0}', Save: '' });
    assert.equal(t`Amount ${123}`, 'Montant 123');
    assert.equal(t`Save`, 'Save');
  } finally {
    setLanguageMapOnTranslationString(undefined);
  }
});

test('general ledger offers stock reference doctypes only with inventory', async () => {
  const fyo = await makeFyo();
  const referenceTypes = () =>
    new GeneralLedger(fyo)
      .getFilters()
      .find(({ fieldname }) => fieldname === 'referenceType')
      .options.map(({ value }) => value);

  fyo.singles.AccountingSettings.enable_inventory = false;
  assert.deepEqual(referenceTypes(), [
    'All',
    'Books Sales Invoice',
    'Books Purchase Invoice',
    'Books Payment',
    'Books Journal Entry',
  ]);
  fyo.singles.AccountingSettings.enable_inventory = true;
  assert.deepEqual(referenceTypes().slice(-3), [
    'Books Shipment',
    'Books Purchase Receipt',
    'Books Stock Movement',
  ]);
});
