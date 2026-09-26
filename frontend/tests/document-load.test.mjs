import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fyo,
  getDocFromNameIfExistsElseNew,
  NotFoundError,
} from './helpers/ui.mjs';

test('a missing document opens a new one, but other load errors surface', async () => {
  const newDoc = { name: 'New Invoice 01' };
  fyo.doc.getNewDoc = () => newDoc;

  fyo.doc.getDoc = async () => {
    throw new NotFoundError('Not Found');
  };
  assert.equal(
    await getDocFromNameIfExistsElseNew('SalesInvoice', 'SINV-1'),
    newDoc
  );

  fyo.doc.getDoc = async () => {
    throw new Error('Server unavailable');
  };
  await assert.rejects(
    getDocFromNameIfExistsElseNew('SalesInvoice', 'SINV-1'),
    /Server unavailable/
  );
});
