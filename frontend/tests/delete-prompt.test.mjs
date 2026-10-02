import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteDocWithPrompt, dialog } from './helpers/ui.mjs';

/** Records each `dialog.danger` call instead of rendering it. */
function captureDangerDialogs() {
  const calls = [];
  dialog.danger = (args) => {
    calls.push(args);
    return { close() {} };
  };
  return calls;
}

function makeDoc() {
  const doc = {
    name: 'SINV-1001',
    schemaName: 'SalesInvoice',
    schema: { label: 'Sales Invoice' },
    isTransactional: true,
    isSubmitted: false,
    deletions: 0,
    async delete() {
      doc.deletions += 1;
    },
  };
  return doc;
}

test('deleting a document asks with a destructive Delete confirmation', async () => {
  const calls = captureDangerDialogs();
  const doc = makeDoc();
  const deleted = deleteDocWithPrompt(doc);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'Delete SINV-1001?');
  assert.equal(calls[0].confirmLabel, 'Delete');
  assert.equal(calls[0].cancelLabel, 'Keep Sales Invoice');
  await calls[0].onConfirm();
  assert.equal(await deleted, true);
  assert.equal(doc.deletions, 1);
});

test('dismissing the delete confirmation keeps the document', async () => {
  const calls = captureDangerDialogs();
  const doc = makeDoc();
  const deleted = deleteDocWithPrompt(doc);

  await calls[0].onCancel();
  assert.equal(await deleted, false);
  assert.equal(doc.deletions, 0);
});

test('deleting a cancelled entry says its ledger entries go too', () => {
  const calls = captureDangerDialogs();
  const message = (values) => {
    deleteDocWithPrompt({ ...makeDoc(), ...values });
    return calls.at(-1).message.children.join('');
  };

  assert.match(message({ isCancelled: true }), /ledger entries/);
  assert.match(
    message({
      schemaName: 'Shipment',
      isTransactional: false,
      isCancelled: true,
    }),
    /ledger entries/
  );
  assert.equal(message({ isCancelled: false }), 'This action is permanent.');
});
