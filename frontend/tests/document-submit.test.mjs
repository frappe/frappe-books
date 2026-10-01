import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  fyo,
  loadFrappeDocTypes,
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

registerFrappeModels({ Entry });
stubFrappe(() => ({ message: { metas: [entryMeta], placements: {} } }));
await loadFrappeDocTypes();

/** A saved draft, and a server whose submit `respond` answers; returns the methods it ran. */
function makeEntry(respond) {
  const warnings = [];
  fyo.onDocumentActionWarning = (warning) => warnings.push(warning);
  const entry = newFrappeDoc('Entry', { name: 'ENT-0001', amount: 100 });
  Object.assign(entry, { modified: MODIFIED, docstatus: 0 });
  entry._notInserted = false;
  entry._dirty = false;
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
  const { entry, methods } = makeEntry((body) => {
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
  const { entry } = makeEntry((body) => {
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
  const { entry, warnings } = makeEntry(submitted);
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
  const { entry, warnings } = makeEntry(submitted);
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
