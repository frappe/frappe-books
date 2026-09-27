import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';
import { getFieldsGroupedByTabAndSection } from './helpers/ui.mjs';

const ACCOUNT_FIELDS = ['account', 'paymentAccount'];

for (const [paymentType, from, to] of [
  ['Receive', 'account', 'paymentAccount'],
  ['Pay', 'paymentAccount', 'account'],
]) {
  test(`a ${paymentType} payment form shows ${from} as From Account, then ${to} as To Account`, async () => {
    const payment = await makePayment(paymentType);

    const details = getFieldsGroupedByTabAndSection(payment.schema, payment)
      .get('Main')
      .get('Details');

    assert.deepEqual(
      details
        .filter(({ fieldname }) => ACCOUNT_FIELDS.includes(fieldname))
        .map(({ fieldname, label }) => [fieldname, label]),
      [
        [from, 'From Account'],
        [to, 'To Account'],
      ]
    );
    assert.equal(payment.fieldMap.account.label, 'Party Account');
    assert.equal(payment.fieldMap.paymentAccount.label, 'Payment Account');
  });
}

test('a Pay quick edit without the party account labels the cash account From Account', async () => {
  const payment = await makePayment('Pay');

  const fields = payment.getFormFields([payment.fieldMap.paymentAccount]);

  assert.deepEqual(
    fields.map(({ fieldname, label }) => [fieldname, label]),
    [['paymentAccount', 'From Account']]
  );
});

async function makePayment(paymentType) {
  const fyo = await makeFyo();
  fyo.doc.getNewDoc('NumberSeries', { name: 'PAY-', referenceType: 'Payment' });
  return fyo.doc.getNewDoc('Payment', { paymentType });
}
