import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFyo } from './helpers/accounting.mjs';

test("a movement row accepts a new batch but not another item's batch", async () => {
  const fyo = await makeFyo();
  fyo.getValue = async (_schemaName, batch) =>
    batch === 'INK-1' ? 'Ink' : undefined;
  const movement = fyo.doc.getNewDoc('StockMovement', {
    items: [{ item: 'Pen' }],
  });
  const row = movement.items[0];
  await row.validations.batch('NEW');
  await assert.rejects(
    row.validations.batch('INK-1'),
    /Batch INK-1 does not belong to Item Pen/
  );
});
