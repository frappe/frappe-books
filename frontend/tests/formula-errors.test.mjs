import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test('a failing formula fails the change that ran it', async () => {
  const fyo = await makeFyo();
  const color = fyo.doc.getNewDoc('Color', { name: 'Red' });
  color.formulas = {
    hexvalue: {
      formula: () => {
        throw new Error('Formula failed');
      },
      dependsOn: ['name'],
    },
  };

  await assert.rejects(color.set('name', 'Blue'), /Formula failed/);
});
