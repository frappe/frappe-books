import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate } from '../../frappe_books/link_queries/generate.mjs';

const link = (fieldname) => ({ fieldname, fieldtype: 'Link', options: 'X' });
const metas = {
  'Sales Invoice': {
    name: 'Sales Invoice',
    fields: [
      link('company'),
      link('customer'),
      link('party_type'),
      link('project'),
      link('contact_person'),
      { fieldname: 'items', fieldtype: 'Table', options: 'Sales Invoice Item' },
    ],
  },
  'Sales Invoice Item': {
    name: 'Sales Invoice Item',
    fields: [link('item_code'), link('income_account')],
  },
};
const form = `
frappe.ui.form.on("Sales Invoice", {
  setup(frm) {
    frm.set_query("customer", (doc) => ({ query: "party_query", filters: { company: doc.company } }));
    frm.set_query("income_account", "items", (doc, cdt, cdn) => ({
      filters: { company: doc.company, item: locals[cdt][cdn].item_code },
    }));
    frm.set_query("project", (doc) => {
      const filters = { company: doc.company };
      if (doc.party_type == "Customer") filters.customer = doc.customer;
      return { filters };
    });
    frm.set_query("contact_person", (doc) => {
      if (doc.customer) return { query: "contact_query", filters: { link_name: doc.customer } };
    });
  },
});`;

test('Desk rules become rules of the document, unless they branch on its values', async () => {
  const { queries, skipped } = await generate({
    bundles: [],
    forms: { 'Sales Invoice': form },
    metas,
    boot: { sysdefaults: {} },
  });

  assert.deepEqual(queries['Sales Invoice'], {
    customer: {
      query: 'party_query',
      filters: { company: 'eval:doc.company' },
    },
    'items.income_account': {
      filters: { company: 'eval:parent.company', item: 'eval:doc.item_code' },
    },
    contact_person: {
      query: 'contact_query',
      filters: { link_name: 'eval:doc.customer' },
      when: ['eval:doc.customer'],
    },
  });
  // `party_type == "Customer"` adds a filter, which no rule of the values gives
  assert.deepEqual(skipped['Sales Invoice'], ['project']);
});

const check = (fieldname) => ({ fieldname, fieldtype: 'Check' });
const invoiceMetas = {
  Invoice: {
    name: 'Invoice',
    fields: [
      check('is_return'),
      link('address'),
      { fieldname: 'items', fieldtype: 'Table', options: 'Invoice Item' },
    ],
  },
  'Invoice Item': {
    name: 'Invoice Item',
    fields: [link('item_code'), link('batch'), check('drop_ship')],
  },
};
const generateInvoice = (setup) =>
  generate({
    bundles: [],
    forms: {
      Invoice: `frappe.ui.form.on("Invoice", { setup(frm) { ${setup} } });`,
    },
    metas: invoiceMetas,
    boot: { sysdefaults: {} },
  });

test("A row's rule takes its parent's Checks", async () => {
  const { queries } = await generateInvoice(`
    frm.set_query("batch", "items", (doc, cdt, cdn) => ({
      query: "batch_query",
      filters: { item_code: locals[cdt][cdn].item_code, is_return: doc.is_return },
    }));`);

  assert.deepEqual(queries.Invoice['items.batch'], {
    query: 'batch_query',
    filters: {
      item_code: 'eval:doc.item_code',
      is_return: 'eval:parent.is_return',
    },
  });
});

test('A rule takes a field of each row of a table', async () => {
  const { queries } = await generateInvoice(`
    frm.set_query("address", (doc) => ({
      query: "address_query",
      filters: {
        items: doc.items.map((item) => item.item_code),
        drop_ship: doc.items.map((item) => item.drop_ship),
      },
    }));`);

  assert.deepEqual(queries.Invoice.address, {
    query: 'address_query',
    filters: {
      items: 'eval:(doc.items || []).map((row) => row.item_code)',
      drop_ship: 'eval:(doc.items || []).map((row) => row.drop_ship)',
    },
  });
});
