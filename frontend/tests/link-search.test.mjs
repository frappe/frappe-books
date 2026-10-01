import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FrappeDoc,
  Link,
  MultiLabelLink,
  fyo,
  loadFrappeDocTypes,
  registerFrappeModels,
} from './helpers/ui.mjs';

const metas = [
  {
    name: 'Books Account',
    permissions: [],
    fields: [{ fieldname: 'root_type', fieldtype: 'Select', label: 'Root' }],
  },
  {
    name: 'Books Party',
    permissions: [],
    fields: [
      { fieldname: 'phone', fieldtype: 'Data', label: 'Phone' },
      { fieldname: 'email', fieldtype: 'Data', label: 'Email' },
    ],
  },
];
const requests = [];
let records = [];

globalThis.window = {
  location: { hostname: 'books.localhost' },
  frappe: { boot: { user: { roles: [] }, books: {} } },
};
globalThis.fetch = async (url, { body } = {}) => {
  const path = decodeURIComponent(url);
  if (path.endsWith('get_books_meta')) {
    return Response.json({ message: { metas, placements: {} } });
  }

  requests.push({ path, args: body && JSON.parse(body) });
  return Response.json({ message: records, data: records });
};

class Account extends FrappeDoc {
  static doctype = 'Books Account';
  static presentation = { label: 'Account' };
}
class Party extends FrappeDoc {
  static doctype = 'Books Party';
  static presentation = { label: 'Party' };
}
registerFrappeModels({ Account, Party });
await loadFrappeDocTypes();

function makeControl(component, props) {
  const control = { ...props };
  const methods = { ...Link.methods, ...component.methods };
  for (const [name, method] of Object.entries(methods)) {
    control[name] = method.bind(control);
  }
  return control;
}

test('link options grouped by a record field come from one search', async () => {
  requests.length = 0;
  records = [{ name: 'Sales', root_type: 'Income' }];
  const link = makeControl(Link, {
    df: { target: 'Account', groupBy: 'root_type' },
  });

  const options = await link.getOptions('', null);

  assert.deepEqual(options, [
    { label: 'Sales', value: 'Sales', group: 'Income' },
  ]);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].args.filter_fields, ['root_type']);
});

test("a multi-label link shows its records' other fields from one search", async () => {
  requests.length = 0;
  records = [{ name: 'Asha', phone: '98200', email: 'asha@example.com' }];
  const link = makeControl(MultiLabelLink, {
    df: { target: 'Party' },
    secondaryLink: 'phone',
    thirdLink: 'email',
  });

  const options = await link.getOptions('as', null);

  assert.deepEqual(options, [
    {
      label: 'Asha',
      value: 'Asha',
      value2: '98200',
      value3: 'asha@example.com',
    },
  ]);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].args.filter_fields, ['phone', 'email']);
});

test("a link without model filters searches by its DocField's link_filters", async (t) => {
  t.after(() => delete fyo.singles.SystemSettings);
  const linkFilters = { account_type: ['in', ['Cash', 'Bank']] };
  const link = makeControl(Link, {
    df: { target: 'Account', schemaName: 'Defaults', linkFilters },
  });

  assert.deepEqual(await link.getFilters(), linkFilters);
  fyo.singles.SystemSettings = { remove_filter: true };
  assert.equal(await link.getFilters(), null);
});
