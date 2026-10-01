import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  fyo,
  getMappedDoc,
  getModel,
  loadFrappeDocTypes,
  newFrappeDoc,
  registerFrappeModels,
  stubFrappe,
  useBooksDoc,
} from './helpers/frappe.mjs';

const moveMeta = {
  name: 'Books Move',
  autoname: 'hash',
  permissions: [],
  fields: [
    { fieldname: 'kind', fieldtype: 'Data', label: 'Kind' },
    { fieldname: 'series', fieldtype: 'Data', label: 'Series' },
    {
      fieldname: 'rows',
      fieldtype: 'Table',
      label: 'Rows',
      options: 'Books Move Row',
    },
  ],
};

const rowMeta = {
  name: 'Books Move Row',
  istable: 1,
  permissions: [],
  fields: [
    { fieldname: 'item', fieldtype: 'Data', label: 'Item', in_list_view: 1 },
    { fieldname: 'rate', fieldtype: 'Float', label: 'Rate' },
    { fieldname: 'quantity', fieldtype: 'Float', label: 'Quantity' },
  ],
};

class MoveRow extends FrappeDoc {
  static refills = { item: ['rate'] };
}

class Move extends FrappeDoc {
  static doctype = 'Books Move';
  static presentation = { label: 'Move' };
  static previewMethod = 'preview';
  static rowModels = { rows: MoveRow };
}

const rates = { Pen: 10, Ink: 20 };

/** Answers previews as a server would: a return's quantities are negative, missing rates come from the item. */
function stubServer() {
  const previews = [];
  const requests = stubFrappe(({ path, body }) => {
    if (path.endsWith('get_books_meta')) {
      return { message: { metas: [moveMeta, rowMeta], placements: {} } };
    }

    if (!path.endsWith('run_doc_method')) {
      return { data: [] };
    }

    const { document } = body;
    previews.push(document);
    const rows = (document.rows ?? []).map((row) => ({
      ...row,
      rate: row.rate || rates[row.item],
      quantity: row.quantity && -Math.abs(row.quantity),
    }));
    const series = document.series ?? 'MOVE-';
    return { data: null, docs: [{ ...document, series, rows }] };
  });
  return { previews, requests };
}

stubServer();
registerFrappeModels({ Move });
await loadFrappeDocTypes();

test('table rows are presented by the row model their parent names', async () => {
  const move = newFrappeDoc('Move');
  await move.append('rows', { item: 'Pen' });
  clearTimeout(move._previewTimer);

  assert.equal(getModel('MoveRow'), MoveRow);
  assert.ok(move.rows[0] instanceof MoveRow);
});

test('editing a field has the preview fill the fields derived from it again', async () => {
  const { previews } = stubServer();
  const move = newFrappeDoc('Move');
  await move.append('rows', { item: 'Pen' });
  await move.preview();
  assert.equal(move.rows[0].rate, 10);

  await move.rows[0].set('rate', 15);
  await move.preview();
  assert.equal(previews[1].rows[0].rate, 15);

  await move.rows[0].set('item', 'Ink');
  await move.preview();
  clearTimeout(move._previewTimer);
  assert.equal('rate' in previews[2].rows[0], false);
  assert.equal(move.rows[0].rate, 20);
});

test('a value the user entered stays theirs when the server only corrects it', async () => {
  const { previews } = stubServer();
  const move = newFrappeDoc('Move');
  await move.append('rows', { item: 'Pen', quantity: 2 });
  await move.preview();
  assert.equal(move.rows[0].quantity, -2);

  await move.set('kind', 'Return');
  await move.preview();
  clearTimeout(move._previewTimer);
  assert.equal(previews[1].rows[0].quantity, -2);
  assert.equal('series' in previews[1], false);
});

test('a value the server leaves empty is cleared, as Frappe sends no empty values', async () => {
  stubFrappe(({ path, body }) => {
    if (!path.endsWith('run_doc_method')) {
      return { data: [] };
    }

    const { kind, ...document } = body.document;
    return { data: null, docs: [kind === 'Return' ? document : body.document] };
  });
  const move = newFrappeDoc('Move', { kind: 'Return' });
  await move.set('series', 'OLD-');

  await move.preview();
  clearTimeout(move._previewTimer);
  assert.equal(move.kind, null);
  assert.equal(move.series, 'OLD-');
});

test('a form previews a new document once it opens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { previews } = stubServer();
  const { doc, load } = useBooksDoc();

  await load('Move', undefined, true);
  t.mock.timers.tick(300);
  await waitFor(() => doc.value.series === 'MOVE-');
  assert.equal(previews.length, 1);
});

test('a document of a Frappe-backed schema is mapped by the server mapper', async () => {
  const { requests } = stubServer();
  stubFrappe((request) => {
    requests.push(request);
    return {
      message: {
        doctype: 'Books Move',
        name: null,
        kind: 'Return',
        rows: [{ name: null, item: 'Pen', quantity: -1, rate: 10 }],
      },
    };
  });
  const source = { schemaName: 'Shipment', name: 'SHPM-1', fyo };

  const move = await getMappedDoc(source, 'Move', 'make_return');

  assert.equal(
    requests[0].path,
    '/api/method/frappe.model.mapper.make_mapped_doc'
  );
  assert.deepEqual(requests[0].body, {
    method:
      'frappe_books.frappe_books.doctype.books_shipment.books_shipment.make_return',
    source_name: 'SHPM-1',
  });
  assert.ok(move instanceof Move);
  assert.ok(move.notInserted && move.name);
  assert.equal(move.kind, 'Return');
  assert.equal(move.rows[0].quantity, -1);
  assert.ok(move.rows[0] instanceof MoveRow);
});

async function waitFor(condition) {
  for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.ok(condition());
}
