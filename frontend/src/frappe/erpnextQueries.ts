/**
 * ERPNext's `set_query` rules for the Link fields accessory mode shows, as
 * data: ERPNext's form scripts never run in /books. Each entry copies one
 * rule of ERPNext's Desk JS, named in its comment (paths under `erpnext/`),
 * so a drift check can compare the two.
 *
 * Values are Desk's: filters as `{ fieldname: value | [operator, value] }`
 * or `[[doctype, fieldname, operator, value]]`, and a whitelisted `query`
 * method. A string `eval:<expression>` anywhere is worked out as DocField
 * link_filters are: over `doc`, the document holding the field (the row of a
 * table field), `parent`, the row's document, and the boot's `frappe`.
 * A dict filter whose value comes out empty is left out, as Desk leaves out
 * an empty Link value.
 */

/** Desk's link filters: a dict, or a list of filters. */
export type DeskFilters = Record<string, unknown> | unknown[][];

/** One `set_query` result. */
export interface LinkQuery {
  /** An `eval:` condition: a rule of cases applies its first case that holds. */
  when?: string;
  query?: string;
  filters?: DeskFilters;
}

export type LinkQueryRule = LinkQuery | LinkQuery[];

const ITEM_QUERY = 'erpnext.controllers.queries.item_query';
const DIMENSION_QUERY = 'erpnext.controllers.queries.get_filtered_dimensions';
const ITEM_UOM_QUERY = 'erpnext.controllers.queries.get_item_uom_query';
const BATCH_QUERY = 'erpnext.controllers.queries.get_batch_no';

/** A `:Company` field of the boot, as `erpnext.get_currency` reads them. */
function bootCompany(company: string, field: string): string {
  return `(frappe.boot.docs.find((d) => d.doctype == ":Company" && d.name == ${company}) || {}).${field}`;
}

const PERPETUAL_INVENTORY = `eval:${bootCompany('parent.company', 'enable_perpetual_inventory')}`;

/** erpnext.queries.party in public/js/queries.js. */
const party: LinkQuery = {
  query: 'erpnext.controllers.queries.party_query',
  filters: { disabled: 0, company: 'eval:doc.company' },
};

/** erpnext.queries.warehouse in public/js/queries.js, for a row. */
const rowWarehouse: LinkQuery = {
  filters: [
    ['Warehouse', 'company', 'in', ['', 'eval:parent.company || ""']],
    ['Warehouse', 'is_group', '=', 0],
  ],
};

/** erpnext.queries.warehouse for a parent field. */
const warehouse: LinkQuery = {
  filters: [
    ['Warehouse', 'company', 'in', ['', 'eval:doc.company || ""']],
    ['Warehouse', 'is_group', '=', 0],
  ],
};

/** erpnext.queries.setup_warehouse_query in public/js/queries.js: a row's warehouses with its item's stock. */
const rowWarehouseWithStock: LinkQuery[] = [
  {
    when: 'eval:doc.item_code',
    query: 'erpnext.controllers.queries.warehouse_query',
    filters: [
      ...(rowWarehouse.filters as unknown[][]),
      ['Bin', 'item_code', '=', 'eval:doc.item_code'],
    ],
  },
  rowWarehouse,
];

/** A row's units of its item: public/js/controllers/transaction.js. */
const rowUom: LinkQuery = {
  query: ITEM_UOM_QUERY,
  filters: { item_code: 'eval:doc.item_code' },
};

/** A row's ledger accounts of the company: public/js/controllers/transaction.js. */
const rowProfitAndLoss: LinkQuery = {
  filters: {
    company: 'eval:parent.company',
    report_type: 'Profit and Loss',
    is_group: 0,
  },
};

/** erpnext.queries.get_filtered_dimensions for a row, by its first account set: public/js/utils/dimension_tree_filter.js. */
function rowDimension(dimension: string, accountFields: string[]): LinkQuery {
  const account = accountFields.map((field) => `doc.${field}`).join(' || ');
  return {
    query: DIMENSION_QUERY,
    filters: {
      dimension,
      account: `eval:${account}`,
      company: 'eval:parent.company',
    },
  };
}

/** set_query_for_batch in public/js/controllers/transaction.js: the batches a row takes out. */
function rowBatchOut(isInwardOnReturn: boolean): LinkQuery {
  return {
    query: BATCH_QUERY,
    filters: {
      item_code: 'eval:doc.item_code',
      posting_date: 'eval:parent.posting_date',
      is_return: 'eval:parent.is_return ? 1 : undefined',
      ...(isInwardOnReturn && {
        is_inward: 'eval:parent.is_return ? 1 : undefined',
      }),
      warehouse: 'eval:doc.warehouse',
    },
  };
}

/** set_query_for_batch: the batches a receipt row brings in. */
const rowBatchIn: LinkQuery = { filters: { item: 'eval:doc.item_code' } };

/** set_query_for_item_tax_template in public/js/controllers/transaction.js. */
const rowItemTaxTemplate: LinkQuery[] = [
  { when: 'eval:!doc.item_code', filters: { company: 'eval:parent.company' } },
  {
    query: 'erpnext.controllers.queries.get_tax_template',
    filters: {
      item_code: 'eval:doc.item_code',
      valid_from: [
        '<=',
        'eval:parent.transaction_date || parent.bill_date || parent.posting_date',
      ],
      item_group: 'eval:doc.item_group',
      base_net_rate: 'eval:doc.base_net_rate',
      disabled: 0,
      tax_category: 'eval:parent.tax_category',
      company: 'eval:parent.company',
    },
  },
];

/** A selling row's items, sold to the `customer` expression's customer: public/js/utils/sales_common.js. */
function rowSalesItem(customer = 'parent.customer'): LinkQuery {
  return {
    query: ITEM_QUERY,
    filters: {
      is_sales_item: 1,
      customer: `eval:${customer}`,
      has_variants: 0,
      company: 'eval:parent.company',
    },
  };
}

/** A buying row's items: public/js/controllers/buying.js. */
const rowPurchaseItem: LinkQuery[] = [
  {
    when: 'eval:parent.is_subcontracted',
    query: ITEM_QUERY,
    filters: {
      supplier: 'eval:parent.supplier',
      company: 'eval:parent.company',
      is_stock_item: 0,
    },
  },
  {
    query: ITEM_QUERY,
    filters: {
      supplier: 'eval:parent.supplier',
      is_purchase_item: 1,
      has_variants: 0,
      company: 'eval:parent.company',
    },
  },
];

/** A tax row's accounts, by the tax table: public/js/controllers/accounts.js. */
function rowTaxAccount(accountTypes: string[]): LinkQuery {
  return {
    query: 'erpnext.controllers.queries.tax_account_query',
    filters: {
      account_type: ['Tax', 'Chargeable', ...accountTypes],
      company: 'eval:parent.company',
    },
  };
}

const salesTaxAccount = rowTaxAccount(['Expense Account']);
const purchaseTaxAccount = rowTaxAccount([
  'Income Account',
  'Expenses Included In Valuation',
]);

/** The company's templates: public/js/controllers/transaction.js. */
const taxesAndCharges: LinkQuery = {
  filters: [
    ['company', '=', 'eval:doc.company'],
    ['docstatus', '!=', 2],
  ],
};

/** The party's submitted documents a return is made against: public/js/controllers/transaction.js. */
function returnAgainst(partyField: string): LinkQuery {
  return {
    filters: {
      docstatus: 1,
      is_return: 0,
      company: 'eval:doc.company',
      [partyField]: `eval:doc.${partyField}`,
    },
  };
}

/** A company's ledger account of the given filters: setup/doctype/company/company.js. */
function companyAccount(filters: Record<string, unknown> = {}): LinkQuery {
  return { filters: { company: 'eval:doc.name', is_group: 0, ...filters } };
}

/** The same, only with perpetual inventory: setup/doctype/company/company.js. */
function perpetualCompanyAccount(filters: Record<string, unknown>): LinkQuery {
  return {
    ...companyAccount(filters),
    when: 'eval:doc.enable_perpetual_inventory',
  };
}

/** A payment's accounts on one side: accounts/doctype/payment_entry/payment_entry.js. */
function paymentAccount(cashTypes: string[], otherSide: string): LinkQuery {
  const types = `(${JSON.stringify(cashTypes)}.includes(doc.payment_type) ? ["Bank", "Cash"] : [frappe.boot.party_account_types[doc.party_type]])`;
  return {
    filters: {
      account_type: [
        'in',
        `eval:${types}.concat(doc.party_type == "Shareholder" ? ["Equity"] : [])`,
      ],
      is_group: 0,
      company: 'eval:doc.company',
      name: `eval:doc.payment_type == "Internal Transfer" && doc.${otherSide} ? ["!=", doc.${otherSide}] : undefined`,
    },
  };
}

/** A party's ledger account per company: selling/doctype/customer/customer.js, buying/doctype/supplier/supplier.js. */
function partyAccount(
  accountType: string,
  rootType: string,
  currency?: string
): LinkQuery {
  return {
    filters: {
      account_type: accountType,
      root_type: rootType,
      company: 'eval:doc.company',
      is_group: 0,
      ...(currency && { account_currency: currency }),
    },
  };
}

/** A party's primary contact or address: selling/doctype/customer/customer.js, buying/doctype/supplier/supplier.js. */
function partyPrimary(partyType: 'customer' | 'supplier', type: string) {
  return {
    query: `erpnext.${partyType === 'customer' ? 'selling' : 'buying'}.doctype.${partyType}.${partyType}.get_${partyType}_primary`,
    filters: { [partyType]: 'eval:doc.name', type },
  };
}

/** Rules by ERPNext doctype, then `fieldname`, or `table.fieldname` for a row's field. */
export const ERPNEXT_QUERIES: Record<string, Record<string, LinkQueryRule>> = {
  'Sales Invoice': {
    // public/js/utils/sales_common.js
    customer: party,
    // accounts/doctype/sales_invoice/sales_invoice.js
    debit_to: {
      filters: {
        account_type: 'Receivable',
        is_group: 0,
        company: 'eval:doc.company',
      },
    },
    // public/js/utils/sales_common.js
    selling_price_list: { filters: { selling: 1, enabled: 1 } },
    // public/js/controllers/transaction.js
    taxes_and_charges: taxesAndCharges,
    // public/js/controllers/transaction.js
    return_against: returnAgainst('customer'),
    // public/js/utils/sales_common.js
    'items.item_code': rowSalesItem(),
    // public/js/controllers/transaction.js
    'items.uom': rowUom,
    // public/js/controllers/transaction.js
    'items.batch_no': rowBatchOut(true),
    // accounts/doctype/sales_invoice/sales_invoice.js
    'items.income_account': {
      query: 'erpnext.controllers.queries.get_income_account',
      filters: { company: 'eval:parent.company', disabled: 0 },
    },
    // public/js/controllers/transaction.js
    'items.expense_account': rowProfitAndLoss,
    // public/js/utils/sales_common.js
    'items.item_tax_template': rowItemTaxTemplate,
    // accounts/doctype/sales_invoice/sales_invoice.js
    'items.warehouse': rowWarehouseWithStock,
    // public/js/utils/dimension_tree_filter.js
    'items.cost_center': rowDimension('cost_center', [
      'income_account',
      'expense_account',
      'discount_account',
      'deferred_revenue_account',
    ]),
    // public/js/controllers/accounts.js
    'taxes.account_head': salesTaxAccount,
  },
  'Purchase Invoice': {
    // public/js/controllers/buying.js
    supplier: party,
    // accounts/doctype/purchase_invoice/purchase_invoice.js
    credit_to: {
      filters: {
        account_type: 'Payable',
        is_group: 0,
        company: 'eval:doc.company',
      },
    },
    // public/js/controllers/buying.js
    buying_price_list: { filters: { buying: 1, enabled: 1 } },
    // public/js/controllers/transaction.js
    taxes_and_charges: taxesAndCharges,
    // public/js/controllers/transaction.js
    return_against: returnAgainst('supplier'),
    // public/js/controllers/buying.js
    'items.item_code': rowPurchaseItem,
    // public/js/controllers/transaction.js
    'items.uom': rowUom,
    // public/js/controllers/transaction.js
    'items.batch_no': [
      { ...rowBatchIn, when: 'eval:parent.update_stock' },
      rowBatchOut(false),
    ],
    // accounts/doctype/purchase_invoice/purchase_invoice.js
    'items.expense_account': {
      query: 'erpnext.controllers.queries.get_expense_account',
      filters: { company: 'eval:parent.company', disabled: 0 },
    },
    // public/js/controllers/buying.js
    'items.item_tax_template': rowItemTaxTemplate,
    // accounts/doctype/purchase_invoice/purchase_invoice.js
    'items.warehouse': rowWarehouse,
    // public/js/utils/dimension_tree_filter.js
    'items.cost_center': rowDimension('cost_center', [
      'expense_account',
      'deferred_expense_account',
    ]),
    // public/js/controllers/accounts.js
    'taxes.account_head': purchaseTaxAccount,
  },
  Quotation: {
    // selling/doctype/quotation/quotation.js
    party_name: [
      { when: 'eval:doc.quotation_to == "Customer"', ...party },
      {
        when: 'eval:doc.quotation_to == "Lead"',
        query: 'erpnext.controllers.queries.lead_query',
      },
    ],
    // public/js/utils/sales_common.js
    selling_price_list: { filters: { selling: 1, enabled: 1 } },
    // public/js/controllers/transaction.js
    taxes_and_charges: taxesAndCharges,
    // public/js/utils/sales_common.js
    'items.item_code': rowSalesItem(
      'parent.quotation_to == "Customer" ? parent.party_name : undefined'
    ),
    // public/js/controllers/transaction.js
    'items.uom': rowUom,
    // public/js/utils/sales_common.js
    'items.item_tax_template': rowItemTaxTemplate,
    // selling/doctype/quotation/quotation.js
    'items.warehouse': {
      filters: { company: 'eval:parent.company', is_group: 0 },
    },
  },
  'Delivery Note': {
    // public/js/utils/sales_common.js
    customer: party,
    // public/js/controllers/transaction.js
    taxes_and_charges: taxesAndCharges,
    // public/js/controllers/transaction.js
    return_against: returnAgainst('customer'),
    // public/js/utils/sales_common.js
    'items.item_code': rowSalesItem(),
    // stock/doctype/delivery_note/delivery_note.js
    'items.warehouse': rowWarehouseWithStock,
    // public/js/controllers/transaction.js
    'items.uom': rowUom,
    // public/js/controllers/transaction.js
    'items.batch_no': rowBatchOut(true),
    // public/js/controllers/transaction.js
    'items.expense_account': rowProfitAndLoss,
    // public/js/utils/dimension_tree_filter.js
    'items.cost_center': rowDimension('cost_center', ['expense_account']),
    // public/js/controllers/accounts.js
    'taxes.account_head': salesTaxAccount,
  },
  'Purchase Receipt': {
    // public/js/controllers/buying.js
    supplier: party,
    // public/js/controllers/transaction.js
    taxes_and_charges: taxesAndCharges,
    // public/js/controllers/transaction.js
    return_against: returnAgainst('supplier'),
    // public/js/controllers/buying.js
    'items.item_code': rowPurchaseItem,
    // stock/doctype/purchase_receipt/purchase_receipt.js
    'items.warehouse': rowWarehouse,
    // public/js/controllers/transaction.js
    'items.uom': rowUom,
    // public/js/controllers/transaction.js
    'items.batch_no': rowBatchIn,
    // stock/doctype/purchase_receipt/purchase_receipt.js
    'items.expense_account': {
      query: 'erpnext.controllers.queries.get_expense_account',
      filters: { company: 'eval:parent.company', disabled: 0 },
    },
    // public/js/utils/dimension_tree_filter.js
    'items.cost_center': rowDimension('cost_center', [
      'expense_account',
      'provisional_expense_account',
    ]),
    // public/js/controllers/accounts.js
    'taxes.account_head': purchaseTaxAccount,
  },
  'Stock Entry': {
    // stock/doctype/stock_entry/stock_entry.js
    'items.item_code': {
      query: ITEM_QUERY,
      filters: { is_stock_item: 1, company: 'eval:parent.company' },
    },
    // stock/doctype/stock_entry/stock_entry.js, less its sample retention warehouse
    'items.s_warehouse': rowWarehouse,
    // stock/doctype/stock_entry/stock_entry.js
    'items.t_warehouse': {
      filters: {
        is_group: 0,
        company: 'eval:parent.company',
        warehouse_type:
          'eval:parent.purpose == "Material Transfer" && parent.add_to_transit ? "Transit" : undefined',
      },
    },
    // stock/doctype/stock_entry/stock_entry.js
    'items.uom': [{ ...rowUom, when: 'eval:doc.item_code' }],
    // stock/doctype/stock_entry/stock_entry.js
    'items.batch_no': {
      query: BATCH_QUERY,
      filters: {
        item_code: 'eval:doc.item_code',
        posting_date: 'eval:parent.posting_date',
        posting_time: 'eval:parent.posting_time',
        warehouse:
          'eval:parent.purpose != "Material Receipt" ? doc.s_warehouse || doc.t_warehouse : undefined',
        is_inward: 'eval:!doc.s_warehouse && doc.t_warehouse ? 1 : undefined',
        include_expired_batches:
          'eval:["Material Receipt", "Material Transfer", "Material Issue"].includes(parent.purpose) ? 1 : undefined',
      },
    },
    // stock/doctype/stock_entry/stock_entry.js
    'items.expense_account': [
      {
        when: PERPETUAL_INVENTORY,
        filters: { company: 'eval:parent.company', is_group: 0 },
      },
    ],
    // public/js/utils/dimension_tree_filter.js
    'items.cost_center': rowDimension('cost_center', ['expense_account']),
  },
  'Payment Entry': {
    // accounts/doctype/payment_entry/payment_entry.js
    party: [
      {
        when: 'eval:doc.party_type == "Employee"',
        query: 'erpnext.controllers.queries.employee_query',
      },
      {
        when: 'eval:["Customer", "Supplier"].includes(doc.party_type)',
        ...party,
      },
      {
        when: 'eval:doc.party_type == "Shareholder"',
        filters: { company: 'eval:doc.company' },
      },
    ],
    // accounts/doctype/payment_entry/payment_entry.js
    paid_from: paymentAccount(['Pay', 'Internal Transfer'], 'paid_to'),
    // accounts/doctype/payment_entry/payment_entry.js
    paid_to: paymentAccount(['Receive', 'Internal Transfer'], 'paid_from'),
    // accounts/doctype/payment_entry/payment_entry.js
    'references.reference_name': [
      {
        when: 'eval:["Sales Invoice", "Sales Order", "Purchase Invoice", "Purchase Order", "Dunning"].includes(doc.reference_doctype)',
        filters: {
          docstatus: 1,
          company: 'eval:parent.company',
          customer:
            'eval:parent.party_type == "Customer" ? parent.party : undefined',
          supplier:
            'eval:parent.party_type == "Supplier" ? parent.party : undefined',
        },
      },
      { filters: { docstatus: 1, company: 'eval:parent.company' } },
    ],
    // accounts/doctype/payment_entry/payment_entry.js
    'deductions.account': {
      filters: { is_group: 0, company: 'eval:parent.company' },
    },
    // public/js/utils/dimension_tree_filter.js
    'deductions.cost_center': rowDimension('cost_center', ['account']),
  },
  'Journal Entry': {
    // accounts/doctype/journal_entry/journal_entry.js
    'accounts.account': {
      filters: {
        company: 'eval:parent.company',
        is_group: 0,
        account_currency: `eval:parent.multi_currency ? undefined : ["in", [${bootCompany('parent.company', 'default_currency')} || frappe.boot.sysdefaults.currency, null]]`,
      },
    },
  },
  Customer: {
    // selling/doctype/customer/customer.js
    customer_primary_contact: partyPrimary('customer', 'Contact'),
    // selling/doctype/customer/customer.js
    customer_primary_address: partyPrimary('customer', 'Address'),
    // selling/doctype/customer/customer.js
    'accounts.account': partyAccount(
      'Receivable',
      'Asset',
      'eval:parent.party_account_currency'
    ),
  },
  Supplier: {
    // buying/doctype/supplier/supplier.js
    supplier_primary_contact: partyPrimary('supplier', 'Contact'),
    // buying/doctype/supplier/supplier.js
    supplier_primary_address: partyPrimary('supplier', 'Address'),
    // buying/doctype/supplier/supplier.js
    'accounts.account': partyAccount('Payable', 'Liability'),
  },
  Item: {
    // stock/doctype/item/item.js
    item_group: { filters: { is_group: 0 } },
    // stock/doctype/item/item.js
    'item_defaults.income_account': {
      query: 'erpnext.controllers.queries.get_income_account',
      filters: { company: 'eval:doc.company' },
    },
    // stock/doctype/item/item.js
    'item_defaults.expense_account': {
      query: 'erpnext.controllers.queries.get_expense_account',
      filters: { company: 'eval:doc.company' },
    },
    // stock/doctype/item/item.js
    'item_defaults.default_warehouse': {
      filters: { is_group: 0, company: 'eval:doc.company' },
    },
  },
  'Item Price': {
    // stock/doctype/item_price/item_price.js
    item_code: { filters: { has_variants: 0 } },
  },
  'Pricing Rule': {
    // accounts/doctype/pricing_rule/pricing_rule.js
    'items.uom': {
      query: 'erpnext.accounts.doctype.pricing_rule.pricing_rule.get_item_uoms',
      filters: {
        value:
          'eval:doc[(parent.apply_on || "").replace(/[- ]/g, "_").toLowerCase()]',
        apply_on: 'eval:parent.apply_on',
      },
    },
  },
  'POS Profile': {
    // accounts/doctype/pos_profile/pos_profile.js
    warehouse,
    // accounts/doctype/pos_profile/pos_profile.js
    print_format: {
      filters: [['Print Format', 'doc_type', '=', 'POS Invoice']],
    },
  },
  'POS Closing Entry': {
    // accounts/doctype/pos_closing_entry/pos_closing_entry.js
    pos_opening_entry: { filters: { status: 'Open', docstatus: 1 } },
  },
  'Loyalty Program': {
    // accounts/doctype/loyalty_program/loyalty_program.js
    expense_account: {
      filters: {
        root_type: 'Expense',
        is_group: 0,
        company: 'eval:doc.company',
      },
    },
  },
  'Coupon Code': {
    // accounts/doctype/coupon_code/coupon_code.js
    pricing_rule: { filters: { coupon_code_based: 1, disable: 0 } },
  },
  'Mode of Payment': {
    // accounts/doctype/mode_of_payment/mode_of_payment.js
    'accounts.default_account': {
      filters: [
        ['Account', 'account_type', 'in', ['Bank', 'Cash', 'Receivable']],
        ['Account', 'is_group', '=', 0],
        ['Account', 'disabled', '=', 0],
        ['Account', 'company', '=', 'eval:doc.company'],
      ],
    },
  },
  Account: {
    // accounts/doctype/account/account.js
    parent_account: { filters: { is_group: 1, company: 'eval:doc.company' } },
  },
  Company: {
    // setup/doctype/company/company.js
    default_warehouse: { filters: { company: 'eval:doc.name' } },
    // setup/doctype/company/company.js
    default_expense_account: companyAccount({ root_type: 'Expense' }),
    // setup/doctype/company/company.js
    round_off_account: companyAccount({
      root_type: ['in', ['Expense', 'Income']],
    }),
    // setup/doctype/company/company.js
    write_off_account: companyAccount({ root_type: 'Expense' }),
    // setup/doctype/company/company.js
    default_discount_account: companyAccount(),
    // setup/doctype/company/company.js
    default_inventory_account: companyAccount({ account_type: 'Stock' }),
    // setup/doctype/company/company.js
    stock_adjustment_account: [
      perpetualCompanyAccount({
        root_type: 'Expense',
        account_type: 'Stock Adjustment',
      }),
    ],
    // setup/doctype/company/company.js
    stock_received_but_not_billed: [
      perpetualCompanyAccount({
        root_type: 'Liability',
        account_type: 'Stock Received But Not Billed',
      }),
    ],
  },
  Batch: {
    // stock/doctype/batch/batch.js
    item: { query: ITEM_QUERY, filters: { is_stock_item: 1, has_batch_no: 1 } },
  },
  'Serial No': {
    // stock/doctype/serial_no/serial_no.js
    item_code: {
      query: ITEM_QUERY,
      filters: { is_stock_item: 1, has_serial_no: 1 },
    },
  },
  'Item Tax Template': {
    // accounts/doctype/item_tax_template/item_tax_template.js
    'taxes.tax_type': {
      filters: [
        ['Account', 'company', '=', 'eval:parent.company'],
        ['Account', 'is_group', '=', 0],
        [
          'Account',
          'account_type',
          'in',
          [
            'Tax',
            'Chargeable',
            'Income Account',
            'Expense Account',
            'Expenses Included In Valuation',
          ],
        ],
      ],
    },
  },
  'Sales Taxes and Charges Template': {
    // public/js/controllers/accounts.js
    'taxes.account_head': salesTaxAccount,
  },
  'Purchase Taxes and Charges Template': {
    // public/js/controllers/accounts.js
    'taxes.account_head': purchaseTaxAccount,
  },
};
