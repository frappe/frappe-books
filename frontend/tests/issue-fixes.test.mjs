import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DateTime } from 'luxon';
import {
  makeFyo,
  GeneralLedger,
  TrialBalance,
  ProfitAndLoss,
  useTranslations,
  getAccountLabel,
  t,
  setLanguageMapOnTranslationString,
} from './helpers/accounting.mjs';
import { reportResult, stubServer } from './helpers/server.mjs';

test('trial balance requests an inclusive to date and renders six amounts', async () => {
  const fyo = await makeFyo();
  const report = new TrialBalance(fyo);
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  let call;
  fyo.db.getReportData = async (...args) => {
    call = args;
    return {
      sections: [
        {
          rootType: 'Asset',
          accounts: [
            {
              name: 'Cash',
              level: 0,
              isGroup: false,
              values: [80, 0, 50, 30, 100, 0],
            },
          ],
          total: [80, 0, 50, 30, 100, 0],
        },
      ],
    };
  };
  await report.setReportData();
  assert.deepEqual(call, ['getTrialBalance', '2026-01-01', '2026-02-01']);
  assert.deepEqual(
    report.reportData.map((row) => row.cells.map((cell) => cell.rawValue)),
    [['Cash', 80, 0, 50, 30, 100, 0]]
  );
  assert.equal(report.getColumns().length, 7);
});

test('general ledger runs its Script Report and styles the server rows', async () => {
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
        { type: 'opening', account: 'Opening', debit: 0, credit: 0, balance: 100 },
        {
          type: 'entry',
          index: 1,
          account: 'Cash',
          date: '2026-01-01',
          debit: 50,
          credit: 0,
          balance: 150,
          reference_type: 'JournalEntry',
        },
        {},
        { type: 'closing', account: 'Closing', debit: 50, credit: 0, balance: 150 },
      ]
    )
  );
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
  assert.equal(cell(entry, 'reference_type').value, 'Journal Entry');
  assert.equal(blank.isEmpty, true);
  assert.equal(cell(closing, 'account').value, 'Closing');
  assert.equal(cell(closing, 'balance').bold, true);
});

test('general ledger opens with the dates the server picks', async () => {
  const report = new GeneralLedger(await makeFyo());
  const calls = stubServer(() => ({ from_date: '2025-09-28', to_date: '2026-09-28' }));
  await report.setDefaultFilters();
  await report.setDefaultFilters();
  assert.deepEqual(calls.map((c) => c.args), [{ report_name: 'Books General Ledger' }]);
  assert.equal(report.fromDate, '2025-09-28');
  assert.equal(report.toDate, '2026-09-28');
});

test('expense-only P&L labels its expense total correctly', async () => {
  const report = new ProfitAndLoss(await makeFyo());
  report._dateRanges = [
    {
      fromDate: DateTime.local(2026, 1, 1),
      toDate: DateTime.local(2027, 1, 1),
    },
  ];
  const rows = report.getReportDataFromSections({
    sections: [{ rootType: 'Expense', accounts: [], total: [10] }],
    profit: [-10],
  });
  assert.equal(rows.at(-1).cells[0].rawValue, 'Total Expense (Debit)');
});

test('stock transfers use only the value of their own rows, including partial receipts and returns', async () => {
  const fyo = await makeFyo();
  fyo.doc.getDoc = async () => ({
    taxes: [{ amount: fyo.pesa(18) }],
    items: [],
  });
  for (const schema of ['PurchaseReceipt', 'Shipment']) {
    for (const amount of [100, 50, -50, 0]) {
      const transfer = fyo.doc.getNewDoc(schema, {
        backReference: 'Invoice',
        items: [{ amount: fyo.pesa(amount) }],
      });
      assert.equal((await transfer.getGrandTotal()).float, amount);
    }
  }
});

test('root groups can be recreated and edited but cannot be deleted', async () => {
  const fyo = await makeFyo();
  fyo.singles.AccountingSettings.setupComplete = true;
  const root = fyo.doc.getNewDoc('Account', {
    name: 'Restored Assets',
    isGroup: true,
    rootType: 'Asset',
  });
  assert.equal(root.required.parentAccount(), false);
  await assert.rejects(root.beforeDelete(), /Root accounts cannot be deleted/);
  const child = fyo.doc.getNewDoc('Account', {
    name: 'Cash',
    parentAccount: root.name,
  });
  await child.beforeDelete();
});

test('Canada selects the French chart only for a French language preference', async () => {
  const fyo = await makeFyo();
  fyo.store.chartsOfAccounts = [
    chart('Standard Chart of Accounts', ''),
    chart('Canada - Plan comptable pour les provinces francophones', 'ca', 'fr'),
  ];
  const wizard = fyo.doc.getNewDoc('SetupWizard', { country: 'Canada' });
  for (const language of ['en', 'en-CA', 'English', '']) {
    fyo.store.language = language;
    assert.equal(
      wizard.formulas.chartOfAccounts.formula(),
      'Standard Chart of Accounts'
    );
  }
  for (const language of ['fr', 'fr-CA', 'fr_CA']) {
    fyo.store.language = language;
    assert.match(
      wizard.formulas.chartOfAccounts.formula(),
      /Canada - Plan comptable/
    );
  }
  assert.ok(
    wizard.constructor.lists
      .chartOfAccounts(wizard)
      .some(({ value }) => value.startsWith('Canada'))
  );
});

test('the setup wizard offers the charts the server lists', async () => {
  const fyo = await makeFyo();
  const swiss = 'Switzerland - General Chart of Accounts';
  fyo.store.chartsOfAccounts = [
    { ...chart('Standard Chart of Accounts', ''), label: 'Plan standard' },
    chart(swiss, 'ch'),
  ];
  const wizard = fyo.doc.getNewDoc('SetupWizard', { country: 'Switzerland' });

  assert.deepEqual(wizard.constructor.lists.chartOfAccounts(wizard), [
    { value: 'Standard Chart of Accounts', label: 'Plan standard' },
    { value: swiss, label: swiss },
  ]);
  assert.equal(wizard.formulas.chartOfAccounts.formula(), swiss);
  wizard.country = 'Japan';
  assert.equal(
    wizard.formulas.chartOfAccounts.formula(),
    'Standard Chart of Accounts'
  );
});

function chart(name, countryCode, language = null) {
  return { name, label: name, country_code: countryCode, language };
}

test('account translations change display labels while identifiers and custom names stay stable', async () => {
  const fyo = await makeFyo();
  const account = fyo.doc.getNewDoc('Account', {
    name: 'Cash',
    parentAccount: 'Cash In Hand',
  });
  try {
    useTranslations({
      Cash: 'Trésorerie',
      'Custom savings': 'Do not use',
      'Amount {0}': 'Montant {0}',
    });
    assert.equal(getAccountLabel(account.name), 'Trésorerie');
    assert.equal(getAccountLabel('Custom savings'), 'Custom savings');
    assert.equal(t`Amount ${123}`, 'Montant 123');
    useTranslations({ Cash: 'Trésorerie', Save: '' });
    assert.equal(t`Save`, 'Save');
    const report = new TrialBalance(fyo);
    const cell = report.getAccountRow({
      name: account.name,
      level: 0,
      isGroup: false,
      values: [],
    }).cells[0];
    assert.equal(cell.value, 'Trésorerie');
    assert.equal(cell.rawValue, 'Cash');
    useTranslations({ Cash: 'Kasse' });
    assert.equal(getAccountLabel(account.name), 'Kasse');
    assert.equal(account.name, 'Cash');
    assert.equal(account.parentAccount, 'Cash In Hand');
  } finally {
    setLanguageMapOnTranslationString(undefined);
  }
});

test('general ledger offers stock reference types only with inventory', async () => {
  const fyo = await makeFyo();
  const referenceTypes = () =>
    new GeneralLedger(fyo)
      .getFilters()
      .find(({ fieldname }) => fieldname === 'referenceType')
      .options.map(({ value }) => value);

  fyo.singles.AccountingSettings.enableInventory = false;
  assert.ok(!referenceTypes().includes('Shipment'));
  fyo.singles.AccountingSettings.enableInventory = true;
  assert.ok(referenceTypes().includes('Shipment'));
  assert.ok(referenceTypes().includes('PurchaseReceipt'));
});
