import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FilterLinkInput, fyo } from './helpers/ui.mjs';

function makeInput(target) {
  const input = { target, value: '', search: '', records: [], request: 0 };
  for (const [name, method] of Object.entries(FilterLinkInput.methods)) {
    input[name] = method.bind(input);
  }
  input.$emit = () => {};
  return input;
}

test('list filter values come from a page of the server link search', async () => {
  const searches = [];
  fyo.db.getAll = () => assert.fail('The whole table must not be loaded');
  fyo.db.searchLink = async (...args) => {
    searches.push(args);
    return [{ name: 'Tax-002' }];
  };
  const input = makeInput('Tax');

  await input.onOpen(true);
  await input.onInput({ target: { value: '002' } });

  assert.deepEqual(
    searches.map(([schemaName, text, filters, , limit]) => [
      schemaName,
      text,
      filters,
      limit,
    ]),
    [
      ['Tax', '', null, 50],
      ['Tax', '002', null, 50],
    ]
  );
  assert.deepEqual(input.records, [
    { label: 'Tax-002', value: 'Tax-002', description: undefined },
  ]);
});

test('a slower earlier search does not replace newer results', async () => {
  const pending = [];
  fyo.db.searchLink = () => new Promise((resolve) => pending.push(resolve));
  const input = makeInput('Tax');

  const first = input.onOpen(true);
  const second = input.onInput({ target: { value: '2' } });
  pending[1]([{ name: 'Tax-002' }]);
  await second;
  pending[0]([{ name: 'Tax-001' }, { name: 'Tax-002' }]);
  await first;

  assert.deepEqual(
    input.records.map(({ value }) => value),
    ['Tax-002']
  );
});
