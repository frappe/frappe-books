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
  standard_rate: 240 + index * 135,
  stock_uom: 'Unit',
  availableQty: 24 + index,
  has_batch_no: 0,
  has_serial_no: 0,
}));

/** Where POS sales ship from; the coffee batch has more stock elsewhere. */
const inventory = 'POS Counter';
const coffee = items[1];
Object.assign(coffee, { has_batch_no: 1, is_stock_item: 1 });
const coffeeBatch = {
  name: 'COFFEE-2026-09',
  batch_id: 'COFFEE-2026-09',
  item: coffee.name,
};

const openingShift = {
  name: 'SHIFT-001',
  docstatus: 1,
  period_start_date: '2026-09-06 09:00:00',
  opening_cash: [10, 20, 50, 100, 200, 500].map((denomination, index) => ({
    name: `cash-${index}`,
    denomination,
    count: 2,
  })),
  balance_details: [
    ['Cash', 1000],
    ['Credit Card', 0],
    ['Bank Transfer', 0],
    ['Store Cash', 500],
  ].map(([mode_of_payment, opening_amount]) => ({
    mode_of_payment,
    opening_amount,
  })),
};

/** Frappe's records by doctype, which the fixture's server answers from. */
const records: Record<string, Row[]> = {
  'Books Mode of Payment': [
    { name: 'Cash', type: 'Cash' },
    { name: 'Credit Card', type: 'Bank' },
    { name: 'Bank Transfer', type: 'Bank', requires_clearance_date: 1 },
    { name: 'Store Cash', type: 'Cash' },
    { name: 'Store UPI', type: 'Bank' },
  ],
  'Books Item': items,
  'Books Stock Ledger Entry': [
    ...items
      .filter((item) => item !== coffee)
      .map((item) => ({ item_code: item.name, actual_qty: item.availableQty })),
    ...[
      { warehouse: inventory, actual_qty: 110 },
      { warehouse: 'Warehouse', actual_qty: 40 },
    ].map((row) => ({
      item_code: coffee.name,
      batch_no: coffeeBatch.name,
      ...row,
    })),
  ],
  'Books Customer': [
    {
      name: 'Aarav Shah',
      loyalty_program: 'Store Rewards',
      loyalty_points: 1250,
    },
  ],
  'Books Price List': [{ name: 'Retail' }, { name: 'Members' }],
  'Books Coupon Code': [{ name: 'FOSSCLUB' }, { name: 'EXPIRED' }],
  'Books Batch': [coffeeBatch],
  'Books POS Opening Entry': [openingShift],
  'Books Sales Invoice': [
    ...Array.from({ length: 24 }, (_, index) => ({
      name: `SINV-2026-${String(index + 1).padStart(4, '0')}`,
      customer: index % 2 ? 'Aarav Shah' : 'Meera Patel',
      posting_date: '2026-09-06',
      posting_time: '10:00:00',
      grand_total: 1250,
      outstanding_amount: 0,
      docstatus: 1,
      is_pos: 1,
    })),
    {
      name: 'SINV-2026-HELD',
      customer: 'Aarav Shah',
      posting_date: '2026-09-06',
      posting_time: '11:00:00',
      grand_total: items[0].standard_rate,
      outstanding_amount: items[0].standard_rate,
      docstatus: 0,
      is_pos: 1,
      items: [
        {
          name: 'held-row',
          item_code: items[0].name,
          stock_qty: 1,
          qty: 1,
          price_list_rate: items[0].standard_rate,
          rate: items[0].standard_rate,
          amount: items[0].standard_rate,
          stock_uom: 'Unit',
        },
      ],
    },
  ],
};

export async function preparePOSData() {
  await loadFrappeFixture(answer);
  // New settings documents, which the fixture fills in below.
  for (const name of getSingleSchemaNames()) {
    newFrappeDoc(name);
  }
  // The server serves it from Frappe's currency precision; it has no default.
  Object.assign(fyo.singles.SystemSettings!, { currency_precision: 2 });
  Object.assign(fyo.singles.AccountingSettings!, {
    enable_invoice_returns: true,
    enable_coupon_code: true,
    enable_price_list: true,
    enable_item_enquiry: true,
    enable_loyalty_point_program: true,
    enable_discounts_and_margin: true,
  });
  Object.assign(fyo.singles.POSSettings!, {
    pos_ui: 'Modern',
    allow_rate_change: true,
    allow_discount_change: true,
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
  return items.map((item) => ({ ...item, rate: fyo.pesa(item.standard_rate) }));
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
    'frappe.desk.search.search_widget': () => getList(body.doctype),
    get_open_shift: () => (shift.open ? openingShift.name : null),
    get_stock_location: () => inventory,
    get_sale_shortfalls: () => [],
    get_loyalty_program_details_with_points: () => ({
      loyalty_points:
        getRecord('Books Customer', body.customer)?.loyalty_points ?? 0,
    }),
  };
  const answerMethod = methods[method] ?? methods[method.split('.').pop()!];
  if (answerMethod) {
    return { message: answerMethod() };
  }

  if (method === 'run_doc_method') {
    return checkCoupons(body) ?? { docs: [preview(body.document)] };
  }

  return { data: getDocuments(path, params) };
}

/** The server refuses the EXPIRED coupon when the POS checks coupons. */
function checkCoupons({ document, kwargs }: Row): Response | undefined {
  if (kwargs?.check_coupons && document.coupon_code === 'EXPIRED') {
    const message = 'Coupon EXPIRED has expired.';
    return Response.json(
      { errors: [{ type: 'ValidationError', message }] },
      { status: 417 }
    );
  }
}

/** A document by its path, a list by its query, or a count. */
function getDocuments(path: string, params: Row): unknown {
  const [, , , route, doctype, name] = path.split('/');
  if (route === 'doctype') {
    return getList(doctype, params.filters).length;
  }

  return name ? getRecord(doctype, name) : getList(doctype, params.filters);
}

/**
 * Totals as the server leaves them. A sale fills the checks it was sent
 * without, as Frappe sends every check, and takes its customer's loyalty
 * program. An opening shift's first cash row takes the counted
 * cash; a closing shift expects what its shift opened with and shares the
 * counted cash among the cash methods.
 */
function preview(document: Row): Row {
  if (document.doctype === 'Books Sales Invoice') {
    const customer = getRecord('Books Customer', document.customer);
    return {
      ...document,
      make_auto_payment: document.make_auto_payment ?? 0,
      make_auto_stock_transfer: document.make_auto_stock_transfer ?? 0,
      loyalty_program: customer?.loyalty_program ?? null,
    };
  }

  if (document.doctype === 'Books POS Opening Entry') {
    const [cashRow] = getCashRows(document.balance_details ?? []);
    if (cashRow) {
      cashRow.opening_amount = getCashTotal(document.opening_cash);
    }
    return document;
  }

  if (document.doctype !== 'Books POS Closing Entry') {
    return document;
  }

  const counted = new Map(
    (document.payment_reconciliation ?? []).map((row: Row) => [
      row.mode_of_payment,
      row,
    ])
  );
  const closingAmounts = openingShift.balance_details.map((row) => {
    const sent = (counted.get(row.mode_of_payment) ?? {}) as Row;
    return {
      name: sent.name ?? null,
      mode_of_payment: row.mode_of_payment,
      opening_amount: row.opening_amount,
      closing_amount: Number(sent.closing_amount ?? 0),
      expected_amount: row.opening_amount,
    };
  });
  shareCountedCash(closingAmounts, getCashTotal(document.closing_cash));
  return {
    ...document,
    pos_opening_entry: openingShift.name,
    payment_reconciliation: closingAmounts.map((row) => ({
      ...row,
      difference: row.closing_amount - Number(row.expected_amount),
    })),
  };
}

/** Each cash method takes up to what it expects, the first also any surplus. */
function shareCountedCash(rows: Row[], counted: number) {
  const cashRows = getCashRows(rows);
  let remaining = counted;
  for (const row of cashRows) {
    row.closing_amount = Math.min(Math.max(row.expected_amount, 0), remaining);
    remaining -= row.closing_amount;
  }

  if (cashRows.length) {
    cashRows[0].closing_amount += remaining;
  }
}

function getCashRows(rows: Row[]): Row[] {
  const cashMethods = getList('Books Mode of Payment', [['type', '=', 'Cash']]);
  return rows.filter((row) =>
    cashMethods.some(({ name }) => name === row.mode_of_payment)
  );
}

function getCashTotal(cash: Row[] = []): number {
  return cash.reduce(
    (total, row) => total + Number(row.denomination) * Number(row.count ?? 0),
    0
  );
}

function getRecord(doctype: string, name: string): Row | undefined {
  return records[doctype]?.find((row) => row.name === name);
}

/**
 * The doctype's records that match each `[field, operator, value]` filter on
 * a field they have; the items have no `is_stock_item`, so every item lists.
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
