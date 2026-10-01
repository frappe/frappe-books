import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FilterLinkInput,
  FilterValueInput,
  FrappeDoc,
  loadFrappeDocTypes,
  registerFrappeModels,
} from './helpers/ui.mjs';

const taxMeta = {
  name: 'Books Tax',
  autoname: 'Prompt',
  permissions: [],
  fields: [
    {
      fieldname: 'details',
      fieldtype: 'Table',
      label: 'Details',
      options: 'Books Tax Detail',
    },
  ],
};
const searches = [];
let search = async () => [];

globalThis.window = {
  location: { hostname: 'books.localhost' },
  frappe: { boot: { user: { roles: [] }, books: {} } },
};
globalThis.fetch = async (url, { body } = {}) => {
  const path = decodeURIComponent(url);
  if (path.endsWith('get_books_meta')) {
    return Response.json({ message: { metas: [taxMeta], placements: {} } });
  }

  const args = JSON.parse(body);
  searches.push(args);
  return Response.json({ message: await search(args) });
};

class Tax extends FrappeDoc {
  static doctype = 'Books Tax';
  static presentation = { label: 'Tax' };
}
registerFrappeModels({ Tax });
await loadFrappeDocTypes();

function makeInput(target) {
  const input = { target, value: '', search: '', records: [], request: 0 };
  for (const [name, method] of Object.entries(FilterLinkInput.methods)) {
    input[name] = method.bind(input);
  }
  input.$emit = () => {};
  return input;
}

test("list filter values come from a page of Frappe's link search", async () => {
  searches.length = 0;
  search = async () => [{ name: 'Tax-002' }];
  const input = makeInput('Tax');

  await input.onOpen(true);
  await input.onInput({ target: { value: '002' } });

  assert.deepEqual(
    searches.map(({ doctype, txt, page_length }) => [
      doctype,
      txt,
      page_length,
    ]),
    [
      ['Books Tax', '', 50],
      ['Books Tax', '0%0%2', 50],
    ]
  );
  assert.deepEqual(input.records, [
    { label: 'Tax-002', value: 'Tax-002', description: undefined },
  ]);
});

test('a slower earlier search does not replace newer results', async () => {
  const pending = [];
  search = () => new Promise((resolve) => pending.push(resolve));
  const input = makeInput('Tax');

  const first = input.onOpen(true);
  const second = input.onInput({ target: { value: '2' } });
  await new Promise((resolve) => setTimeout(resolve));
  pending[1]([{ name: 'Tax-002' }]);
  await second;
  pending[0]([{ name: 'Tax-001' }, { name: 'Tax-002' }]);
  await first;

  assert.deepEqual(
    input.records.map(({ value }) => value),
    ['Tax-002']
  );
});

test('a dynamic link filter searches the schema its type filter names by doctype', () => {
  const field = {
    fieldtype: 'DynamicLink',
    fieldname: 'party',
    references: 'reference_type',
  };
  const filters = [
    { fieldname: 'reference_type', condition: '=', value: 'Books Tax' },
  ];

  const target = FilterValueInput.computed.linkTarget.call({ field, filters });

  assert.equal(target, 'Tax');
});
