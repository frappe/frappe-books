import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCSV, parseCSV } from './helpers/accounting.mjs';

test('CSV export neutralises formulas but keeps numbers', () => {
  const row = ['=1+2', '+SUM(A1)', '@cmd', '-2+3', '-100.00', '+5', -7];
  assert.equal(
    generateCSV([row]),
    "'=1+2,'+SUM(A1),'@cmd,'-2+3,-100.00,+5,-7"
  );
});

test('CSV export keeps quotes that are part of a value', () => {
  const row = ['"Quoted"', 'say "hi"', 'a,b', 'plain'];
  const csv = generateCSV([row]);
  assert.equal(csv, '"""Quoted""","say ""hi""","a,b",plain');
  assert.deepEqual(parseCSV(csv), [row]);
});

test('CSV import reads back the values export escaped as formulas', () => {
  const row = [
    '+91 98765 43210',
    '=HYPERLINK("x")',
    '@home',
    "'=typed quote",
    "'quoted",
    "'-5",
  ];
  assert.deepEqual(parseCSV(generateCSV([row])), [row]);
});
