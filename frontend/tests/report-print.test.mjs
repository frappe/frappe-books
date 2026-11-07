import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GeneralLedger,
  getCellTypeStyle,
  getPrintedFilters,
  makeFyo,
} from './helpers/accounting.mjs';

test('a printed report states the filters it ran with', async () => {
  const report = new GeneralLedger(await makeFyo());
  report.filters = report.getFilters();
  report.referenceType = 'All';
  report.groupBy = 'none';
  report.party = 'Acme Retail';
  report.reverted = true;

  assert.equal(
    getPrintedFilters(report),
    'Party: Acme Retail · Include Cancelled'
  );
});

test('printed cells keep the indent, bold and italics of the report', () => {
  const row = { cells: [], isGroup: true };

  assert.deepEqual(getCellTypeStyle({ indent: 2, italics: true }, row), {
    fontWeight: 'bold',
    fontStyle: 'italic',
    paddingInlineStart: '2.5rem',
  });
});
