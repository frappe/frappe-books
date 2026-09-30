import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  errors,
  evaluateCondition,
  evaluateHidden,
  evaluateReadOnly,
  evaluateRequired,
  fyo,
  getFrappeDoc,
  getMappedFrappeDoc,
  getMissingMandatoryFields,
  loadTestDocTypes,
  newFrappeDoc,
  stubFrappe,
  useBooksDoc,
} from './helpers/frappe.mjs';

const { TestItem } = await loadTestDocTypes();
const MODIFIED = '2026-09-30 10:00:00.123456';
const CREATED = '2026-09-29 09:00:00.654321';

const savedPen = {
  name: 'Pen',
  item_type: 'Product',
  rate: 12.5,
  income_account: 'Sales',
  track_item: 1,
  batch_series: 'PEN-',
  released_on: '2026-09-30 15:30:00',
  modified: MODIFIED,
  uom_conversions: [{ name: 'row-1', uom: 'Box', conversion_factor: 10 }],
};

function stubDocument(doc = savedPen, respond = () => undefined) {
  return stubFrappe(async (request) => {
    const answer = await respond(request);
    if (answer) {
      return answer;
    }

    if (request.method === 'GET') {
      return { data: doc };
    }

    // A preview that fills nothing.
    if (request.path.endsWith('run_doc_method')) {
      return { docs: [request.body.document] };
    }

    return { data: { ...doc, ...request.body, modified: MODIFIED } };
  });
}

const field = (doc, fieldname) => doc.fieldMap[fieldname];

test('a saved document loads with form values and its rows', async () => {
  const requests = stubDocument();
  const pen = await getFrappeDoc('Item', 'Pen');

  assert.equal(requests[0].path, '/api/v2/document/Books Item/Pen');
  assert.equal(pen.rate.float, 12.5);
  assert.equal(pen.track_item, true);
  // Frappe stores datetimes in the system time zone, here UTC+05:30.
  assert.equal(pen.released_on.toISOString(), '2026-09-30T10:00:00.000Z');
  assert.equal(pen.modified, MODIFIED);
  assert.equal(pen.uom_conversions[0].conversion_factor, 10);
  assert.equal(pen.uom_conversions[0].parentdoc, pen);
  assert.equal(pen.dirty, false);
  assert.equal(await getFrappeDoc('Item', 'Pen'), pen);
});

test('a missing document is not found', async () => {
  stubFrappe(() => ({
    status: 404,
    body: { errors: [{ type: 'DoesNotExistError', message: 'Not found' }] },
  }));
  await assert.rejects(getFrappeDoc('Item', 'Nothing'), errors.NotFoundError);
});

test('depends_on, read_only_depends_on and mandatory_depends_on apply to the form', async () => {
  const item = newFrappeDoc('Item', { item_type: 'Service' });
  const trackItem = field(item, 'track_item');
  const batchSeries = field(item, 'batch_series');
  assert.equal(evaluateHidden(trackItem, item), true);

  await item.set('item_type', 'Product');
  assert.equal(evaluateHidden(trackItem, item), false);
  assert.equal(evaluateReadOnly(batchSeries, item), false);
  assert.equal(evaluateRequired(batchSeries, item), false);

  await item.set('track_item', true);
  assert.equal(evaluateReadOnly(batchSeries, item), true);
  assert.equal(evaluateRequired(batchSeries, item), true);
  assert.ok(getMissingMandatoryFields(item).includes(batchSeries));
  clearTimeout(item._previewTimer);

  stubDocument({ ...savedPen, track_item: 0 });
  const untracked = await getFrappeDoc('Item', 'Untracked');
  assert.equal(evaluateHidden(field(untracked, 'track_item'), untracked), true);
});

test('form conditions read the document status, as Frappe forms do', () => {
  const order = newFrappeDoc('Order', { customer: 'Acme' });
  assert.equal(
    evaluateCondition('eval:!doc.docstatus', order.getEvalDoc()),
    true
  );
  order.docstatus = 1;
  assert.equal(
    evaluateCondition('eval:!doc.docstatus', order.getEvalDoc()),
    false
  );
});

test('a new document is inserted whole; its rows go without client names', async () => {
  const requests = stubDocument(savedPen);
  const item = newFrappeDoc('Item', { name: 'Pen', income_account: 'Sales' });
  await item.append('uom_conversions', { uom: 'Box', conversion_factor: 10 });
  const saved = [];
  item.once('afterSync', () => saved.push(item.name));
  clearTimeout(item._previewTimer);

  await item.sync();

  const insert = requests.find(({ path }) => path.endsWith('/Books Item'));
  assert.equal(insert.method, 'POST');
  assert.equal(insert.body.name, 'Pen');
  assert.equal(insert.body.income_account, 'Sales');
  assert.equal(insert.body.track_item, 0);
  assert.equal('modified' in insert.body, false);
  assert.deepEqual(insert.body.uom_conversions, [
    { uom: 'Box', conversion_factor: 10 },
  ]);
  assert.deepEqual(saved, ['Pen']);
  assert.equal(item.inserted, true);
  assert.equal(item.dirty, false);
});

test('a save sends the whole document with the modified time Frappe checks', async () => {
  const requests = stubDocument();
  const pen = await getFrappeDoc('Item', 'Pen', { refresh: true });
  await pen.set('rate', fyo.pesa(15));
  await pen.append('uom_conversions', { uom: 'Crate', conversion_factor: 20 });
  clearTimeout(pen._previewTimer);

  await pen.sync();

  const update = requests.find(({ method }) => method === 'PUT');
  assert.equal(update.path, '/api/v2/document/Books Item/Pen');
  assert.equal(update.body.modified, MODIFIED);
  assert.equal(Number(update.body.rate), 15);
  assert.equal(update.body.released_on, '2026-09-30 15:30:00.000');
  assert.deepEqual(
    update.body.uom_conversions.map((row) => row.name),
    ['row-1', undefined]
  );
});

test('a stale save shows as a conflict', async () => {
  stubDocument(savedPen, ({ method }) =>
    method === 'PUT'
      ? {
          status: 417,
          body: {
            errors: [{ type: 'TimestampMismatchError', message: 'Stale' }],
          },
        }
      : undefined
  );
  const pen = await getFrappeDoc('Item', 'Pen', { refresh: true });
  await pen.set('rate', fyo.pesa(16));
  clearTimeout(pen._previewTimer);
  await assert.rejects(pen.sync(), errors.ConflictError);
});

test('a preview fills what the server fills, again until the user edits it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previews = [];
  const requests = stubDocument(savedPen, ({ path, body }) => {
    if (!path.endsWith('run_doc_method')) {
      return;
    }

    previews.push(body);
    const { document } = body;
    const account = document.item_type === 'Service' ? 'Service' : 'Sales';
    return {
      data: null,
      docs: [
        { ...document, income_account: document.income_account ?? account },
      ],
    };
  });
  const item = newFrappeDoc('Item', { name: 'Tea' });

  await item.set('item_type', 'Product');
  await item.set('rate', fyo.pesa(3));
  assert.equal(requests.length, 0);
  t.mock.timers.tick(300);
  await waitFor(() => item.income_account === 'Sales');
  assert.equal(previews.length, 1);
  assert.equal(previews[0].method, 'preview');
  assert.equal(previews[0].document.doctype, 'Books Item');
  assert.equal(previews[0].document.__islocal, 1);

  // The server's value is filled again for the new type.
  await item.set('item_type', 'Service');
  t.mock.timers.tick(300);
  await waitFor(() => item.income_account === 'Service');
  assert.equal('income_account' in previews[1].document, false);

  // The user's own value stays.
  await item.set('income_account', 'Consulting');
  await item.set('item_type', 'Product');
  t.mock.timers.tick(300);
  await waitFor(() => previews.length === 3);
  assert.equal(previews[2].document.income_account, 'Consulting');
  assert.equal(item.income_account, 'Consulting');
});

test('a preview is dropped when the values changed meanwhile or the draft is stale', async () => {
  let edit;
  stubDocument(savedPen, async ({ path, body }) => {
    if (!path.endsWith('run_doc_method')) {
      return;
    }

    await edit?.();
    return {
      data: null,
      docs: [{ ...body.document, income_account: 'Sales' }],
    };
  });
  const item = newFrappeDoc('Item', { name: 'Coffee' });
  edit = () => item.set('rate', fyo.pesa(2));
  await item.preview();
  assert.equal(item.income_account, null);
  clearTimeout(item._previewTimer);

  stubDocument(savedPen, () => ({
    status: 417,
    body: { errors: [{ type: 'TimestampMismatchError', message: 'Stale' }] },
  }));
  await item.preview();
  assert.equal(item.income_account, null);
});

test('a save previews first when the server fills a missing value', async () => {
  const requests = stubDocument(savedPen, ({ path, body }) =>
    path.endsWith('run_doc_method')
      ? { data: null, docs: [{ ...body.document, income_account: 'Sales' }] }
      : undefined
  );
  const item = newFrappeDoc('Item', { name: 'Pencil' });
  await item.sync();
  assert.deepEqual(
    requests.map(({ method, path }) => `${method} ${path}`),
    ['POST /api/v2/method/run_doc_method', 'POST /api/v2/document/Books Item']
  );
  assert.equal(requests[1].body.income_account, 'Sales');
});

test('a save waits for the fills of the last edit', async () => {
  const requests = stubDocument(savedPen, ({ path, body }) => {
    if (path.endsWith('run_doc_method')) {
      const { document } = body;
      const account = document.item_type === 'Service' ? 'Service' : 'Sales';
      return {
        docs: [
          { ...document, income_account: document.income_account ?? account },
        ],
      };
    }
  });
  const item = newFrappeDoc('Item', { name: 'Chai', income_account: 'Sales' });
  TestItem.refills = { item_type: ['income_account'] };
  await item.set('item_type', 'Service');
  TestItem.refills = {};

  await item.sync();
  assert.deepEqual(
    requests.map(({ path }) => path),
    ['/api/v2/method/run_doc_method', '/api/v2/document/Books Item']
  );
  // The model refills the account after the type, though the user set it.
  assert.equal('income_account' in requests[0].body.document, false);
  assert.equal(requests[1].body.income_account, 'Service');
});

test('a new document previews once its form opens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = stubDocument(savedPen);
  const { doc, load } = useBooksDoc();
  const item = newFrappeDoc('Item', { name: 'Mocha' });

  await load('Item', item.name, true);
  assert.equal(doc.value, item);
  t.mock.timers.tick(300);
  await waitFor(() => requests.length === 1);
  assert.equal(requests[0].body.method, 'preview');
});

test("a server mapper's document is a new document with the mapped values", async () => {
  const requests = stubFrappe(() => ({
    message: { doctype: 'Books Order', name: null, customer: 'Acme' },
  }));
  const order = await getMappedFrappeDoc('Order', 'app.make_order', 'Q-1');

  assert.equal(
    requests[0].path,
    '/api/method/frappe.model.mapper.make_mapped_doc'
  );
  assert.deepEqual(requests[0].body, {
    method: 'app.make_order',
    source_name: 'Q-1',
  });
  assert.equal(order.customer, 'Acme');
  assert.equal(order.amount.float, 0);
  assert.equal(order.notInserted, true);
  assert.equal(order, await getFrappeDoc('Order', order.name));
});

test('submit and cancel run the document methods on the client copy', async () => {
  const saved = {
    name: 'ORD-1',
    customer: 'Acme',
    amount: 5,
    docstatus: 0,
    modified: MODIFIED,
    creation: '2026-09-29 09:00:00.654321',
    owner: 'clerk@example.com',
  };
  const requests = stubDocument(saved, ({ path, body }) => {
    if (!path.endsWith('run_doc_method')) {
      return;
    }

    const docstatus = body.method === 'submit' ? 1 : 2;
    return { data: null, docs: [{ ...body.document, docstatus }] };
  });
  const order = await getFrappeDoc('Order', 'ORD-1');
  assert.equal(order.canSubmit, true);
  const submitted = [];
  fyo.doc.observer.on('submit:Order', (name) => submitted.push(name));

  await order.submit();
  assert.equal(order.submitted, true);
  assert.deepEqual(submitted, ['ORD-1']);
  const submit = requests.at(-1).body;
  assert.equal(submit.method, 'submit');
  assert.deepEqual(
    [submit.document.doctype, submit.document.name, submit.document.modified],
    ['Books Order', 'ORD-1', MODIFIED]
  );
  // Frappe refuses to save a copy whose creation or owner differs.
  assert.deepEqual(
    [submit.document.creation, submit.document.owner],
    [saved.creation, saved.owner]
  );
  assert.equal(submit.document.docstatus, 0);

  await order.cancel();
  assert.equal(order.cancelled, true);
  assert.equal(requests.at(-1).body.method, 'cancel');
  // Frappe refuses a copy whose status differs from the one it holds.
  assert.equal(requests.at(-1).body.document.docstatus, 1);
  assert.equal(order.canDelete, true);
});

test('delete removes the document and tells the lists', async () => {
  const requests = stubDocument(savedPen, ({ method }) =>
    method === 'DELETE' ? { data: 'ok' } : undefined
  );
  const pen = await getFrappeDoc('Item', 'Pen', { refresh: true });
  const deleted = [];
  fyo.doc.observer.on('delete:Item', (name) => deleted.push(name));

  await pen.delete();

  assert.equal(requests.at(-1).method, 'DELETE');
  assert.equal(requests.at(-1).path, '/api/v2/document/Books Item/Pen');
  assert.deepEqual(deleted, ['Pen']);
  await getFrappeDoc('Item', 'Pen');
  assert.equal(requests.at(-1).method, 'GET');
});

test('a duplicate copies unsaved edits but not the no_copy fields', async () => {
  stubDocument();
  const pen = await getFrappeDoc('Item', 'Pen', { refresh: true });
  await pen.set('rate', fyo.pesa(20));
  clearTimeout(pen._previewTimer);

  const copy = await pen.duplicate();

  assert.equal(copy.name, 'Pen CPY');
  assert.equal(copy.notInserted, true);
  assert.equal(copy.rate.float, 20);
  assert.equal(copy.released_on, null);
  assert.equal(copy.uom_conversions[0].uom, 'Box');
  assert.notEqual(copy.uom_conversions[0].name, 'row-1');
  assert.equal(await getFrappeDoc('Item', 'Pen CPY'), copy);
});

async function waitFor(condition) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.fail('The condition was never met');
}
