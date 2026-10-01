import { fyo } from 'src/initFyo';
import { newFrappeDoc } from 'src/frappe/documents';
import { getSingleSchemaNames } from 'src/frappe/registry';
import { loadFrappeFixture } from './frappe';

export const shift = { open: true };

export const products = [
  'Organic Assam Tea',
  'Roasted Arabica Coffee Beans',
  'Stoneware Coffee Mug',
  'Stainless Steel Tea Infuser',
  'Cotton Kitchen Towel',
  'Reusable Glass Water Bottle',
];

type Row = Record<string, any>;
type Filter = [string, string, unknown];

const items = products.map((name, index) => ({
  name,
  rate: 240 + index * 135,
  unit: 'Unit',
  availableQty: 24 + index,
  has_batch: 0,
  has_serial_number: 0,
}));

const openingShift = {
  name: 'SHIFT-001',
  docstatus: 1,
  opening_date: '2026-09-06 09:00:00',
  opening_cash: [10, 20, 50, 100, 200, 500].map((denomination, index) => ({
    name: `cash-${index}`,
    denomination,
    count: 2,
  })),
  opening_amounts: [
    ['Cash', 1000],
    ['Credit Card', 0],
    ['Bank Transfer', 0],
    ['Store Cash', 500],
  ].map(([payment_method, amount]) => ({ payment_method, amount })),
};

/** Frappe's records by doctype, which the fixture's server answers from. */
const records: Record<string, Row[]> = {
  'Books Payment Method': [
    { name: 'Cash', type: 'Cash' },
    { name: 'Credit Card', type: 'Transfer' },
    { name: 'Bank Transfer', type: 'Transfer', requires_clearance_date: 1 },
    { name: 'Store Cash', type: 'Cash' },
    { name: 'Store UPI', type: 'Transfer' },
  ],
  'Books Item': items,
  'Books Party': [
    {
      name: 'Aarav Shah',
      role: 'Customer',
      loyalty_program: 'Store Rewards',
      loyalty_points: 1250,
    },
  ],
  'Books Price List': [{ name: 'Retail' }, { name: 'Members' }],
  'Books Batch': [{ name: 'TEA-2026-09' }],
  'Books Pos Opening Shift': [openingShift],
  'Books Sales Invoice': Array.from({ length: 24 }, (_, index) => ({
    name: `SINV-2026-${String(index + 1).padStart(4, '0')}`,
    party: index % 2 ? 'Aarav Shah' : 'Meera Patel',
    date: '2026-09-06 10:00:00',
    grand_total: 1250,
    outstanding_amount: 0,
    docstatus: 1,
    is_pos: 1,
  })),
};

export async function preparePOSData() {
  await loadFrappeFixture(answer);
  // New settings documents, which the fixture fills in below.
  for (const name of getSingleSchemaNames()) {
    newFrappeDoc(name);
  }
  Object.assign(fyo.singles.AccountingSettings!, {
    enable_invoice_returns: true,
    enable_coupon_code: true,
    enable_price_list: true,
    enable_item_enquiry: true,
    enable_loyalty_program: true,
    enable_discounting: true,
  });
  Object.assign(fyo.singles.POSSettings!, {
    pos_ui: 'Modern',
    can_change_rate: true,
    can_edit_discount: true,
  });
  Object.assign(fyo.singles.InventorySettings!, {
    enable_uom_conversions: false,
  });
  Object.assign(fyo.singles.Defaults!, {
    pos_cash_denominations: [1, 2, 5, 10, 20, 50, 100, 200, 500].map(
      (value) => ({
        denomination: fyo.pesa(value),
      })
    ),
    save_button_colour: '',
    cancel_button_colour: '',
    held_button_colour: '',
    return_button_colour: '',
    pay_button_colour: '',
  });
  return items.map((item) => ({ ...item, rate: fyo.pesa(item.rate) }));
}

/** What the server answers each request the POS makes. */
function answer(path: string, body: Row, params: Row): unknown {
  const method = path.split('/').pop()!;
  const methods: Record<string, () => unknown> = {
    'frappe.client.get_list': () =>
      getPage(
        getList(body.doctype, body.filters),
        body.limit_start,
        body.limit_page_length
      ),
    'frappe.desk.search.search_link': () =>
      getList(body.doctype).map(({ name }) => ({ value: name })),
    get_open_shift: () => (shift.open ? openingShift.name : null),
    get_stock_location: () => null,
    get_stock_quantities: () =>
      items.map((item) => ({ item: item.name, quantity: item.availableQty })),
  };
  const answerMethod = methods[method] ?? methods[method.split('.').pop()!];
  if (answerMethod) {
    return { message: answerMethod() };
  }

  if (method === 'run_doc_method') {
    return { docs: [preview(body.document)] };
  }

  return { data: getDocuments(path, params) };
}

/** A document by its path, a list by its query, or a count. */
function getDocuments(path: string, params: Row): unknown {
  const [, , , route, doctype, name] = path.split('/');
  if (route === 'doctype') {
    return getList(doctype, params.filters).length;
  }

  return name ? getRecord(doctype, name) : getList(doctype, params.filters);
}

/** Totals as the server leaves them; a closing shift expects what its shift opened with. */
function preview(document: Row): Row {
  if (document.doctype !== 'Books Pos Closing Shift') {
    return document;
  }

  const counted = new Map(
    (document.closing_amounts ?? []).map((row: Row) => [
      row.payment_method,
      row,
    ])
  );
  const closingAmounts = openingShift.opening_amounts.map((row) => {
    const sent = (counted.get(row.payment_method) ?? {}) as Row;
    const closing = Number(sent.closing_amount ?? 0);
    return {
      name: sent.name ?? null,
      payment_method: row.payment_method,
      opening_amount: row.amount,
      closing_amount: closing,
      expected_amount: row.amount,
      difference_amount: closing - Number(row.amount),
    };
  });
  return {
    ...document,
    opening_shift: openingShift.name,
    closing_amounts: closingAmounts,
  };
}

function getRecord(doctype: string, name: string): Row | undefined {
  return records[doctype]?.find((row) => row.name === name);
}

/**
 * The doctype's records that match each `[field, operator, value]` filter on
 * a field they have; the items have no `track_item`, so every item lists.
 */
function getList(doctype: string, filters: Filter[] = []): Row[] {
  return (records[doctype] ?? []).filter((row) =>
    filters.every(
      ([field, operator, value]) =>
        !(field in row) || matches(row[field], operator, value)
    )
  );
}

/** The rows from `start`, `length` of them unless it is 0. */
function getPage(rows: Row[], start = 0, length = 0): Row[] {
  return rows.slice(start, length ? start + length : undefined);
}

function matches(actual: unknown, operator: string, value: unknown) {
  switch (operator) {
    case 'like':
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(value).replaceAll('%', '').toLowerCase());
    case '=':
      return (actual ?? 0) == value;
    case '!=':
      return (actual ?? 0) != value;
    case 'in':
      return (value as unknown[]).includes(actual ?? 0);
    case 'is':
      return value === 'set' ? !!actual : !actual;
    default:
      return true;
  }
}
