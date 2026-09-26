import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DateTime } from 'luxon';
import {
  makeFyo,
  GeneralLedger,
  TrialBalance,
  ProfitAndLoss,
  StockQueue,
  useTranslations,
  getAccountLabel,
  t,
  setLanguageMapOnTranslationString,
} from './helpers/accounting.mjs';

test('empty FIFO stock has no residual value or valuation and can be replenished', () => {
  const stock = new StockQueue();
  stock.inward(0.1, 1);
  stock.inward(0.2, 1);
  assert.equal(stock.outward(2), 0.15000000000000002);
  assert.equal(stock.quantity, 0);
  assert.equal(stock.value, 0);
  assert.equal(stock.fifo, 0);
  assert.deepEqual(stock.queue, []);
  stock.inward(7.5, 0.5);
  assert.equal(stock.fifo, 7.5);
  assert.equal(stock.outward(0.25), 7.5);
  assert.equal(stock.value, 1.875);
  assert.equal(stock.outward(0.25), 7.5);
  assert.equal(stock.fifo, 0);
});

test('fractional FIFO depletion clears rounding dust without discarding small stock', () => {
  const stock = new StockQueue();
  stock.inward(10, 0.1);
  stock.inward(20, 0.2);
  assert.ok(Number.isFinite(stock.outward(0.3)));
  assert.deepEqual([stock.quantity, stock.value, stock.fifo], [0, 0, 0]);
  assert.deepEqual(stock.queue, []);
  stock.inward(10, 1e-20);
  stock.outward(0.5e-20);
  assert.ok(stock.quantity > 0);
  assert.equal(stock.fifo, 10);
  for (const invalid of [NaN, Infinity, -1, 0]) {
    assert.equal(stock.inward(10, invalid), null);
    assert.equal(stock.outward(invalid), null);
  }
});

test('trial balance closing includes opening and period entries, but no later entries', async () => {
  const report = new TrialBalance(await makeFyo());
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  report._dateRanges = await report._getDateRanges();
  const values = (
    await report._getGroupedByDateRanges(
      new Map([
        [
          'Cash',
          [
            entry(1, '2025-12-31', 100, 20),
            entry(2, '2026-01-01', 50, 0),
            entry(3, '2026-01-31', 0, 30),
            entry(4, '2026-02-01', 999, 0),
          ],
        ],
      ])
    )
  ).get('Cash');
  assert.deepEqual(
    report._dateRanges.map((range) => values.get(range)),
    [
      { debit: 80, credit: 0 },
      { debit: 50, credit: 30 },
      { debit: 100, credit: 0 },
    ]
  );
  assert.deepEqual((await report._getQueryFilters()).date, ['<', '2026-02-01']);
});

for (const ascending of [true, false]) {
  test(`general ledger carries prior balances across vouchers, ascending=${ascending}`, async () => {
    const fyo = await makeFyo();
    const report = new GeneralLedger(fyo);
    report.fromDate = '2026-01-01';
    report.toDate = '2026-01-31';
    report.account = 'Cash';
    report.ascending = ascending;
    report.columns = report.getColumns();
    fyo.db.getAllRaw = async (_schema, options) => {
      assert.equal(options.filters.account, 'Cash');
      assert.equal(options.filters.reverted, false);
      const rows = [
        entry(1, '2025-12-31', 100, 0),
        entry(2, '2026-01-01', 50, 0),
        entry(3, '2026-01-31', 0, 20),
      ];
      return ascending ? rows : rows.reverse();
    };
    await report.setReportData();
    const records = report.reportData
      .filter((row) => !row.isEmpty)
      .map((row) =>
        Object.fromEntries(
          row.cells.map((cell, i) => [
            report.columns[i].fieldname,
            cell.rawValue,
          ])
        )
      );
    assert.equal(records[0].account, 'Opening');
    assert.equal(records[0].balance, 100);
    assert.equal(
      records.find((row) => row.referenceName === 'V2').balance,
      150
    );
    assert.equal(
      records.find((row) => row.referenceName === 'V3').balance,
      130
    );
    assert.equal(records.at(-1).balance, 130);
    assert.equal(records.at(-1).debit, 50);
    assert.equal(records.at(-1).credit, 20);
  });
}

test('expense-only P&L labels its expense total correctly', async () => {
  const report = new ProfitAndLoss(await makeFyo());
  report._dateRanges = [
    {
      fromDate: DateTime.local(2026, 1, 1),
      toDate: DateTime.local(2027, 1, 1),
    },
  ];
  const roots = [
    {
      name: 'Expenses',
      rootType: 'Expense',
      valueMap: new Map(),
      children: [],
    },
  ];
  const rows = report.getReportDataFromRows([], [], [], roots);
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
      .chartOfAccounts()
      .some((name) => name.startsWith('Canada'))
  );
});

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
    report._dateRanges = [];
    const cell = report.getRowFromAccountListNode({ name: account.name })
      .cells[0];
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

test('general ledger group balances include inactive groups and respect all non-date filters', async () => {
  const fyo = await makeFyo();
  const report = new GeneralLedger(fyo);
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  report.party = 'Customer';
  report.referenceType = 'SalesInvoice';
  report.referenceName = 'Invoice';
  report.groupBy = 'account';
  report.ascending = true;
  report.columns = report.getColumns();
  fyo.db.getAllRaw = async (_schema, options) => {
    assert.deepEqual(options.filters, {
      date: ['<', '2026-02-01'],
      party: 'Customer',
      referenceType: 'SalesInvoice',
      referenceName: 'Invoice',
      reverted: false,
    });
    return [
      entry(1, '2025-12-31', 100, 0, 'Cash'),
      entry(2, '2025-12-31', 0, 100, 'Income'),
      entry(3, '2026-01-01', 20, 0, 'Cash'),
    ];
  };
  await report.setReportData();
  const totals = report.reportData.filter(
    (row) => row.cells[1].rawValue === 'Total'
  );
  assert.deepEqual(
    totals.map((row) => row.cells[5].rawValue),
    [120, -100]
  );
  assert.equal(report.reportData.at(-1).cells[5].rawValue, 20);
  await report.setReportData('grouped');
  assert.equal(report.reportData.at(-1).cells[5].rawValue, 20);
});

test('general ledger with no transactions still reports the opening as closing', async () => {
  const fyo = await makeFyo();
  const report = new GeneralLedger(fyo);
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  report.columns = report.getColumns();
  fyo.db.getAllRaw = async (_schema, { filters }) => {
    assert.deepEqual(filters.date, ['<', '2026-02-01']);
    return [entry(1, '2025-12-31', 0, 100)];
  };
  await report.setReportData();
  assert.equal(report.reportData[0].cells[5].rawValue, -100);
  assert.equal(report.reportData.at(-1).cells[5].rawValue, -100);
});

function entry(name, date, debit, credit, account = 'Cash') {
  return {
    name,
    date: new Date(date),
    debit,
    credit,
    account,
    referenceType: 'JournalEntry',
    referenceName: `V${name}`,
    party: '',
    reverted: false,
    reverts: '',
  };
}

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
