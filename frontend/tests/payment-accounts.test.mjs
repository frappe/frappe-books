import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

const accountNames = [
  ['Cash', 'Cash In Hand', 'Cash'],
  ['Bank', 'Bank Accounts', 'Bank Account'],
  ['Payable', 'Accounts Payable', 'Creditors'],
  ['Receivable', 'Accounts Receivable', 'Debtors'],
];

for (const paymentType of ['Pay', 'Receive']) {
  for (const paymentMethod of ['Cash', 'Bank']) {
    test(`${paymentType} ${paymentMethod} defaults select ledger accounts even when groups come first`, async () => {
      const payment = await makePayment(paymentType, paymentMethod);
      const cashOrBank = paymentMethod === 'Cash' ? 'Cash' : 'Bank Account';

      assert.equal(
        await payment.formulas.account.formula(),
        paymentType === 'Pay' ? cashOrBank : 'Debtors'
      );
      assert.equal(
        await payment.formulas.paymentAccount.formula(),
        paymentType === 'Pay' ? 'Creditors' : cashOrBank
      );
    });

    test(`${paymentType} ${paymentMethod} defaults stay empty when only group accounts exist`, async () => {
      const payment = await makePayment(paymentType, paymentMethod, true);

      assert.equal(await payment.formulas.account.formula(), null);
      assert.equal(await payment.formulas.paymentAccount.formula(), null);
    });
  }
}

for (const paymentType of ['Pay', 'Receive']) {
  test(`${paymentType} accounts wait for a payment method`, async () => {
    const payment = await makePayment(paymentType, null);

    const field = paymentType === 'Pay' ? 'account' : 'paymentAccount';
    assert.equal(await payment.formulas[field].formula(), undefined);
  });
}

async function makePayment(paymentType, paymentMethod, groupsOnly = false) {
  const fyo = await makeFyo();
  const accounts = accountNames.flatMap(([accountType, group, ledger]) => [
    { name: group, accountType, isGroup: true },
    ...(groupsOnly ? [] : [{ name: ledger, accountType, isGroup: false }]),
  ]);

  fyo.db.getAll = async (schemaName, { filters }) => {
    assert.equal(schemaName, 'Account');
    return accounts.filter((account) =>
      Object.entries(filters).every(([field, value]) => {
        if (Array.isArray(value)) {
          assert.equal(value[0], 'in');
          return value[1].includes(account[field]);
        }
        return account[field] === value;
      })
    );
  };
  fyo.doc.getNewDoc('PaymentMethod', {
    name: paymentMethod,
    type: paymentMethod,
  });
  fyo.doc.getNewDoc('NumberSeries', { name: 'PAY-', referenceType: 'Payment' });
  return fyo.doc.getNewDoc('Payment', { paymentType, paymentMethod });
}
