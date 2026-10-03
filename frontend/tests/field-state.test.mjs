import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  errors,
  FrappeDoc,
  fyo,
  getFrappeDoc,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
} from './helpers/frappe.mjs';

const noteMeta = {
  name: 'Books Note',
  autoname: 'hash',
  is_submittable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'title',
      fieldtype: 'Data',
      label: 'Title',
      reqd: 1,
      mandatory_depends_on: 'eval:1',
    },
    {
      fieldname: 'priority',
      fieldtype: 'Select',
      label: 'Priority',
      options: '\nLow\nHigh',
    },
    {
      fieldname: 'due_on',
      fieldtype: 'Data',
      label: 'Due On',
      mandatory_depends_on: "eval:doc.priority == 'High'",
    },
    { fieldname: 'owner_note', fieldtype: 'Data', label: 'Owner Note' },
    {
      fieldname: 'reason',
      fieldtype: 'Data',
      label: 'Reason',
      mandatory_depends_on: 'eval:1',
    },
    {
      fieldname: 'code',
      fieldtype: 'Data',
      label: 'Code',
      hidden: 1,
      read_only: 1,
    },
    {
      fieldname: 'reference',
      fieldtype: 'Data',
      label: 'Reference',
      set_only_once: 1,
    },
    { fieldname: 'amount', fieldtype: 'Currency', label: 'Amount' },
    { fieldname: 'held_on', fieldtype: 'Date', label: 'Held On' },
  ],
};

class Note extends FrappeDoc {
  static doctype = 'Books Note';
  static presentation = {
    label: 'Note',
    fields: {
      code: { hidden: false, readOnly: false },
      reason: { required: false },
    },
  };

  required = {
    title: () => true,
    reason: () => true,
    owner_note: () => this.priority === 'Low',
  };
}

stubFrappe(() => ({ message: { metas: [noteMeta], placements: {} } }));
registerFrappeModels({ Note });
await loadFrappeDocTypes();

const state = (doc, fieldname) => doc.getFieldState(doc.fieldMap[fieldname]);
const missing = (doc) => doc.missingFields.map(({ fieldname }) => fieldname);

function loadNote(values) {
  stubFrappe(() => ({ data: { name: 'N-1', title: 'Saved', ...values } }));
  return getFrappeDoc('Note', 'N-1', { refresh: true });
}

test("a field's own property beats its condition and the model's rule", () => {
  const note = newFrappeDoc('Note');

  assert.equal(state(note, 'title').required, true);
  // The presentation's false beats mandatory_depends_on and the model's map.
  assert.equal(state(note, 'reason').required, false);
  // And the DocType's hidden and read only.
  assert.deepEqual(state(note, 'code'), {
    hidden: false,
    readOnly: false,
    required: false,
  });
});

test("a field without its own property follows its condition, then the model's rule", async () => {
  const note = newFrappeDoc('Note');
  assert.equal(state(note, 'due_on').required, false);
  assert.equal(state(note, 'owner_note').required, false);

  await note.set('priority', 'High');
  assert.equal(state(note, 'due_on').required, true);

  await note.set('priority', 'Low');
  assert.equal(state(note, 'due_on').required, false);
  assert.equal(state(note, 'owner_note').required, true);
});

test('a saved field set once, and every field of a submitted document, is read only', async () => {
  const draft = newFrappeDoc('Note');
  assert.equal(state(draft, 'reference').readOnly, false);

  const saved = await loadNote({ docstatus: 0 });
  assert.equal(state(saved, 'reference').readOnly, true);
  assert.equal(state(saved, 'code').readOnly, false);

  const submitted = await loadNote({ docstatus: 1 });
  // Before the presentation's false.
  assert.equal(state(submitted, 'code').readOnly, true);
});

test('the save asks for each empty field the form marks required, once', async () => {
  const note = newFrappeDoc('Note');
  await note.set('priority', 'High');
  assert.deepEqual(missing(note), ['title', 'due_on']);
  await assert.rejects(note.sync(), {
    name: 'MandatoryError',
    message: 'Value missing for Title, Due On',
  });

  await note.set({ title: 'Plan', priority: 'Low' });
  assert.equal(state(note, 'owner_note').required, true);
  assert.deepEqual(missing(note), ['owner_note']);
  await assert.rejects(note.sync(), errors.MandatoryError);
});

test('a field the form marks required cannot be cleared', async () => {
  const note = newFrappeDoc('Note', { priority: 'High', due_on: 'Friday' });
  await assert.rejects(note.set('due_on', null), {
    name: 'ValidationError',
    message: 'Due On is required',
  });

  await note.set('priority', 'Low');
  assert.equal(await note.set('due_on', null), true);
});

test('conditions read the values once per change: after an edit or a preview', async () => {
  const note = newFrappeDoc('Note', { title: 'Plan' });
  let reads = 0;
  note.getEvalDoc = () => {
    reads += 1;
    return FrappeDoc.prototype.getEvalDoc.call(note);
  };

  assert.equal(state(note, 'due_on').required, false);
  assert.equal(state(note, 'reason').required, false);
  missing(note);
  assert.equal(reads, 1);

  await note.set('priority', 'High');
  assert.equal(state(note, 'due_on').required, true);
  assert.deepEqual(missing(note), ['due_on']);
  assert.equal(reads, 2);

  note.applyPreview({ title: 'Plan', priority: 'Low' });
  assert.equal(state(note, 'due_on').required, false);
  assert.deepEqual(missing(note), ['owner_note']);
  assert.equal(reads, 3);
});

test('an amount or a date changed back to its saved value is unchanged', async () => {
  stubFrappe(() => ({
    data: { name: 'N-2', amount: 12.5, held_on: '2026-10-01' },
  }));
  const note = await getFrappeDoc('Note', 'N-2');
  const savedDate = note.held_on.getTime();
  assert.equal(note.isChanged('amount'), false);

  await note.set('amount', fyo.pesa(15));
  await note.set('held_on', new Date('2026-10-02'));
  assert.equal(note.isChanged('amount'), true);
  assert.equal(note.isChanged('held_on'), true);

  await note.set('amount', fyo.pesa(12.5));
  await note.set('held_on', new Date(savedDate));
  assert.equal(note.isChanged('amount'), false);
  assert.equal(note.isChanged('held_on'), false);
});
