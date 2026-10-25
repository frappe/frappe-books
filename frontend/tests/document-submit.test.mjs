import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  fyo,
  loadFrappeDocTypes,
  loadSaved,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

// Frappe's stored value, which the server compares to refuse stale documents.
const MODIFIED = '2026-09-28 10:00:00.123456';
const entryMeta = {
  name: 'Books Entry',
  autoname: 'Prompt',
  is_submittable: 1,
  permissions: [],
  fields: [{ fieldname: 'amount', fieldtype: 'Currency', label: 'Amount' }],
};

class Entry extends FrappeDoc {
  static doctype = 'Books Entry';
  static presentation = { label: 'Entry' };
}

// A POS shift's entry, which its form submits as it saves.
class Shift extends FrappeDoc {
  static doctype = 'Books Shift';
  static presentation = { label: 'Shift' };
  static submitsOnInsert = true;
}

const shiftMeta = { ...entryMeta, name: 'Books Shift' };

registerFrappeModels({ Entry, Shift });
stubFrappe(() => ({
  message: { metas: [entryMeta, shiftMeta], placements: {} },
}));
await loadFrappeDocTypes();

/** A saved draft, and a server whose submit `respond` answers; returns the methods it ran. */
async function makeEntry(respond) {
  const warnings = [];
  fyo.onDocumentActionWarning = (warning) => warnings.push(warning);
  const entry = newFrappeDoc('Entry', { name: 'ENT-0001', amount: 100 });
  await loadSaved(entry, { modified: MODIFIED, docstatus: 0 });
  const methods = [];
  stubFrappe(async ({ body }) => {
    methods.push([body.method, body.document.modified]);
    const answer = await respond(body);
    return answer.status ? answer : { docs: [answer] };
  });
  return { entry, warnings, methods };
}

const submitted = ({ document }) => ({ ...document, docstatus: 1 });

test('submission notifies listeners after the server accepts the document without rerunning model hooks', async () => {
  const calls = [];
  const { entry, methods } = await makeEntry((body) => {
    assert.equal(entry.submitted, false);
    calls.push('server');
    return submitted(body);
  });
  entry.afterSubmit = () => {
    assert.fail('Accounting hooks must run only on the server');
  };
  entry.once('afterSubmit', () => {
    assert.equal(entry.submitted, true);
    assert.equal(entry.dirty, false);
    assert.equal(entry.canSubmit, false);
    calls.push('listener');
  });

  await entry.submit();
  await entry.submit();

  assert.deepEqual(calls, ['server', 'listener']);
  assert.deepEqual(methods, [['submit', MODIFIED]]);
});

test('a rejected submission retains the draft and listeners for a successful retry', async () => {
  let submissions = 0;
  let notifications = 0;
  const { entry } = await makeEntry((body) => {
    submissions++;
    if (submissions === 1) {
      const message = 'Account cannot receive a posting';
      return { status: 417, body: { errors: [{ message }] } };
    }

    return submitted(body);
  });
  entry.once('afterSubmit', () => notifications++);

  await assert.rejects(entry.submit(), /Account cannot receive a posting/);

  assert.equal(entry.inserted, true);
  assert.equal(entry.submitted, false);
  assert.equal(entry.dirty, false);
  assert.equal(entry.canSubmit, true);
  assert.equal(notifications, 0);

  await entry.submit();

  assert.equal(entry.submitted, true);
  assert.equal(notifications, 1);
});

test('submitted values survive a failing change handler without allowing resubmission', async () => {
  const { entry, warnings } = await makeEntry(submitted);
  entry.change = async () => {
    throw new Error('Display update failed');
  };

  await entry.submit();

  assert.equal(entry.inserted, true);
  assert.equal(entry.dirty, false);
  assert.equal(entry.submitted, true);
  assert.equal(entry.canSubmit, false);
  assert.equal(warnings[0].action, 'submit');
});

test('a failed submission callback cannot turn a posted document into a failed submission', async () => {
  const { entry, warnings } = await makeEntry(submitted);
  let notified = false;
  entry.once('afterSubmit', () => {
    throw new Error('Invoice refresh failed');
  });
  entry.once('afterSubmit', () => {
    notified = true;
  });

  await entry.submit();

  assert.equal(entry.submitted, true);
  assert.equal(entry.canSubmit, false);
  assert.equal(notified, true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].action, 'submit');
});

test('a new shift offers Submit only, which saves it and then submits it', async () => {
  const shift = newFrappeDoc('Shift', { name: 'SHIFT-0001', amount: 5 });
  assert.equal(shift.canSave, false);
  assert.equal(shift.canSubmit, true);

  const calls = [];
  stubFrappe(({ method, path, body }) => {
    if (body.method === 'submit') {
      calls.push(['submit', body.document.name]);
      return { docs: [{ ...body.document, docstatus: 1 }] };
    }

    calls.push([method, path]);
    return { data: { ...body, modified: MODIFIED, docstatus: 0 } };
  });
  await shift.submit();

  assert.deepEqual(calls, [
    ['POST', '/api/v2/document/Books Shift'],
    ['submit', 'SHIFT-0001'],
  ]);
  assert.equal(shift.submitted, true);

  // A saved draft of the same model saves and submits as any other.
  const draft = newFrappeDoc('Shift', { name: 'SHIFT-0002', amount: 5 });
  await loadSaved(draft, { modified: MODIFIED, docstatus: 0 });
  await draft.set('amount', 6);
  assert.equal(draft.canSave, true);
  assert.equal(draft.canSubmit, false);
});
