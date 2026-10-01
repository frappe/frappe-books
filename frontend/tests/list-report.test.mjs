import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getReportCellColorClass } from './helpers/accounting.mjs';

test('report cells round with the system display precision', () => {
  assert.equal(
    getReportCellColorClass({ rawValue: 0.004 }, 3),
    'text-ink-gray-7'
  );
  assert.equal(
    getReportCellColorClass({ rawValue: 0.0004 }, 3),
    'text-ink-gray-5'
  );
});
