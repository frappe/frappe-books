import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('a failing formula fails the change that ran it', async () => {
  const fyo = await makeFyo();
  const unit = fyo.doc.getNewDoc('UOM', { name: 'Box' });
  unit.formulas = {
    isWhole: {
      formula: () => {
        throw new Error('Formula failed');
      },
      dependsOn: ['name'],
    },
  };

  await assert.rejects(unit.set('name', 'Crate'), /Formula failed/);
});
