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

test('general ledger sends its filters and renders server rows', async () => {
  const fyo = await makeFyo();
  const report = new GeneralLedger(fyo);
  report.fromDate = '2026-01-01';
  report.toDate = '2026-01-31';
  report.account = 'Cash';
  report.ascending = true;
  report.filters = report.getFilters();
  report.columns = report.getColumns();
  let filters;
  fyo.db.getReportData = async (query, requested) => {
    assert.equal(query, 'getGeneralLedger');
    filters = requested;
    return [
      { type: 'opening', account: null, debit: 0, credit: 0, balance: 100 },
      {
        type: 'entry',
        index: 1,
        account: 'Cash',
        date: '2026-01-01',
        debit: 50,
        credit: 0,
        balance: 150,
        party: null,
        referenceType: 'JournalEntry',
        referenceName: 'V2',
        reverted: false,
      },
      { type: 'blank' },
      { type: 'closing', debit: 50, credit: 0, balance: 150 },
    ];
  };
  await report.setReportData();
  assert.equal(filters.account, 'Cash');
  assert.equal(filters.ascending, true);
  assert.equal(filters.reverted, false);
  const cell = (row, fieldname) =>
    row.cells[report.columns.findIndex((c) => c.fieldname === fieldname)];
  const [opening, entry, blank, closing] = report.reportData;
  assert.equal(cell(opening, 'account').value, 'Opening');
  assert.equal(cell(opening, 'balance').rawValue, 100);
  assert.equal(cell(opening, 'account').italics, true);
  assert.equal(cell(entry, 'index').value, '1');
  assert.equal(cell(entry, 'referenceType').value, 'Journal Entry');
  assert.equal(blank.isEmpty, true);
  assert.equal(cell(closing, 'account').value, 'Closing');
  assert.equal(cell(closing, 'balance').bold, true);
  assert.ok(!report.columns.some((c) => c.fieldname === 'reverted'));
});

test('general ledger labels group openings by their account', async () => {
  const report = new GeneralLedger(await makeFyo());
  assert.equal(
    report._getAccountLabel({ type: 'opening', account: 'Cash' }),
    'Opening: Cash'
  );
  assert.equal(report._getAccountLabel({ type: 'total' }), 'Total');
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
