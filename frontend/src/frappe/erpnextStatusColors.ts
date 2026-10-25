/**
 * The colours ERPNext's list views give stored statuses, by doctype, for
 * doctypes without DocType states: ERPNext sets them in its list JS
 * (`get_indicator`, file named per entry under `erpnext/`), which never runs
 * in /books. Draft, Submitted and Cancelled keep Books' docstatus badges.
 */
export const ERPNEXT_STATUS_COLORS: Record<string, Record<string, string>> = {
  // accounts/doctype/sales_invoice/sales_invoice_list.js
  'Sales Invoice': {
    Unpaid: 'Orange',
    Paid: 'Green',
    Return: 'Gray',
    'Credit Note Issued': 'Gray',
    'Unpaid and Discounted': 'Orange',
    'Partly Paid and Discounted': 'Yellow',
    'Overdue and Discounted': 'Red',
    Overdue: 'Red',
    'Partly Paid': 'Yellow',
    'Internal Transfer': 'Gray',
  },
  // accounts/doctype/purchase_invoice/purchase_invoice_list.js
  'Purchase Invoice': {
    'Debit Note Issued': 'Gray',
    Unpaid: 'Orange',
    Paid: 'Green',
    Return: 'Gray',
    Overdue: 'Red',
    'Partly Paid': 'Yellow',
    'Internal Transfer': 'Gray',
  },
  // selling/doctype/quotation/quotation_list.js
  Quotation: {
    Lost: 'Gray',
    Open: 'Orange',
    'Partially Ordered': 'Yellow',
    Ordered: 'Green',
    Expired: 'Gray',
  },
  // stock/doctype/delivery_note/delivery_note_list.js
  'Delivery Note': {
    Return: 'Gray',
    Closed: 'Green',
    'Return Issued': 'Gray',
    'To Bill': 'Orange',
    'Partially Billed': 'Yellow',
    Completed: 'Green',
  },
  // stock/doctype/purchase_receipt/purchase_receipt_list.js
  'Purchase Receipt': {
    Return: 'Gray',
    Closed: 'Green',
    'Return Issued': 'Gray',
    'To Bill': 'Orange',
    'Partly Billed': 'Yellow',
    Completed: 'Green',
  },
  // accounts/doctype/pos_opening_entry/pos_opening_entry_list.js
  'POS Opening Entry': { Open: 'Orange', Closed: 'Green' },
  // accounts/doctype/pos_closing_entry/pos_closing_entry_list.js
  'POS Closing Entry': { Queued: 'Orange', Failed: 'Red' },
};
