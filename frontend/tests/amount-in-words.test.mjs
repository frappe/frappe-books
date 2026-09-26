import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAmountInWords } from './helpers/accounting.mjs';

const usd = { fraction: 'Cent', fractionUnits: 100 };
const inr = { fraction: 'Paisa', fractionUnits: 100 };

test('amounts use the currency fraction unit', () => {
  assert.equal(
    getAmountInWords(1234.5, usd, 'en-US'),
    'One Thousand Two Hundred And Thirty Four and Fifty Cent only'
  );
  assert.equal(
    getAmountInWords(1.005, { fraction: 'Fils', fractionUnits: 1000 }, 'en-US'),
    'One and Five Fils only'
  );
  assert.equal(
    getAmountInWords(1500.4, { fraction: 'Sen', fractionUnits: 0 }, 'ja-JP'),
    'One Thousand Five Hundred only'
  );
});

test('amounts follow the locale numbering system', () => {
  assert.equal(
    getAmountInWords(12_345_678, usd, 'en-US'),
    'Twelve Million Three Hundred And Forty Five Thousand Six Hundred And Seventy Eight only'
  );
  assert.equal(
    getAmountInWords(12_345_678, inr, 'en-IN'),
    'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred And Seventy Eight only'
  );
  assert.equal(getAmountInWords(0, inr, 'en-IN'), 'Zero only');
});
