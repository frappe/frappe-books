import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fyo,
  getRowDetails,
  getRowSummary,
  newFrappeDoc,
} from './helpers/frappe.mjs';
import { loadFrappeModels } from './helpers/models.mjs';

await loadFrappeModels();

test('row details list every visible column of a row', () => {
  fyo.singles.AccountingSettings = { enable_discounts_and_margin: true };
  const invoice = newFrappeDoc('SalesInvoice', {
    items: [
      {
        item_code: 'Widget',
        qty: 2,
        stock_qty: 2,
        price_list_rate: fyo.pesa(50),
        amount: fyo.pesa(100),
      },
    ],
  });
  const details = getRowDetails(invoice.items[0]);
  const byKey = Object.fromEntries(
    details.map((detail) => [detail.key, detail])
  );

  for (const key of ['name', 'idx', 'parent', 'parentfield']) {
    assert.equal(byKey[key], undefined);
  }
  assert.equal(byKey.description.value, '—');
  assert.ok(byKey.discount_percentage);
  // Fields the server keeps for ERPNext stay out.
  assert.equal(byKey.net_rate, undefined);
  assert.deepEqual(
    details.filter((detail) => detail.emphasis).map((detail) => detail.key),
    ['amount']
  );
});

test('a row summary pairs the quantity with the rate in its unit', () => {
  const invoice = newFrappeDoc('SalesInvoice', {
    items: [
      {
        item_code: 'Paper',
        qty: 6,
        uom: 'Box',
        stock_qty: 300,
        conversion_factor: 50,
        price_list_rate: fyo.pesa(3100),
        amount: fyo.pesa(18600),
      },
    ],
  });
  const row = invoice.items[0];
  const fields = row.schema.tableFields.map((name) => row.fieldMap[name]);

  assert.equal(getRowSummary(row, fields).meta, '6 × 3,100.00');
});

test('a tax row summary names its account, type and rate, and its running total', () => {
  const invoice = newFrappeDoc('SalesInvoice', {
    taxes: [
      {
        charge_type: 'On Net Total',
        account_head: 'VAT',
        rate: 5,
        tax_amount: fyo.pesa(40),
        total: fyo.pesa(1090),
      },
      {
        charge_type: 'Actual',
        account_head: 'Freight',
        rate: 0,
        tax_amount: fyo.pesa(25),
        total: fyo.pesa(1115),
      },
    ],
  });
  const [vat, freight] = invoice.taxes;
  const { mobileTableFields, mobileRowDetail } = vat.schema;
  const fields = mobileTableFields.map((name) => vat.fieldMap[name]);
  const detail = vat.fieldMap[mobileRowDetail];

  assert.deepEqual(getRowSummary(vat, fields, detail), {
    title: 'VAT',
    meta: 'On Net Total · 5%',
    amount: '40.00',
    detail: 'Total 1,090.00',
    amountLabel: undefined,
    failed: false,
  });
  // An Actual charge has no rate.
  assert.equal(getRowSummary(freight, fields, detail).meta, 'Actual');
});

test('a payment reference summary labels its outstanding and allocation', () => {
  const payment = newFrappeDoc('PaymentEntry', {
    references: [
      {
        reference_doctype: 'Books Sales Invoice',
        reference_name: 'SINV-1',
        outstanding_amount: fyo.pesa(600),
        allocated_amount: fyo.pesa(385),
      },
    ],
  });
  const [row] = payment.references;
  const { mobileTableFields, mobileLabelledFields } = row.schema;
  const fields = mobileTableFields.map((name) => row.fieldMap[name]);

  const summary = getRowSummary(row, fields, undefined, mobileLabelledFields);
  assert.deepEqual(
    [summary.title, summary.meta, summary.amount, summary.amountLabel],
    ['SINV-1', 'Sales Invoice · Outstanding 600.00', '385.00', 'Allocated']
  );
});
