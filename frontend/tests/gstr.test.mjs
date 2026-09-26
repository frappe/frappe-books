import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GSTR1, makeFyo } from './helpers/accounting.mjs';

const GSTIN = '27AAAAA0000A1Z5';

async function getGstrRow(taxes) {
  const fyo = await makeFyo();
  const invoice = {
    name: 'SINV-1',
    party: 'Customer',
    date: new Date('2026-01-01'),
    grandTotal: fyo.pesa(118),
    netTotal: fyo.pesa(100),
    taxes: taxes.map(([account, rate, amount]) => ({
      account,
      rate,
      amount: fyo.pesa(amount),
    })),
  };
  fyo.doc.getDoc = async (schemaName) =>
    schemaName === 'Party' ? { gstin: GSTIN } : invoice;
  fyo.getValue = async () => GSTIN;
  const { rate, igstAmt, cgstAmt, sgstAmt, nilRated, exempt, nonGST } =
    await new GSTR1(fyo).getGstrRow(invoice.name);
  return { rate, igstAmt, cgstAmt, sgstAmt, nilRated, exempt, nonGST };
}

test('GSTR row of a CGST and SGST invoice', async () => {
  assert.deepEqual(
    await getGstrRow([
      ['CGST', 9, 9],
      ['SGST', 9, 9],
    ]),
    {
      rate: 18,
      igstAmt: undefined,
      cgstAmt: 9,
      sgstAmt: 9,
      nilRated: undefined,
      exempt: undefined,
      nonGST: undefined,
    }
  );
});

test('GSTR row of an IGST invoice', async () => {
  assert.deepEqual(await getGstrRow([['IGST', 18, 18]]), {
    rate: 18,
    igstAmt: 18,
    cgstAmt: undefined,
    sgstAmt: undefined,
    nilRated: undefined,
    exempt: undefined,
    nonGST: undefined,
  });
});
