import { FrappeDoc } from 'src/frappe/document';

/** Books Number Series, served by Frappe; its counter is Frappe's Series. */
export class NumberSeries extends FrappeDoc {
  static override doctype = 'Books Number Series';
  // Standalone only
  static override erpnextDoctype = null;
  static override presentation = {
    label: 'Number Series',
    nameField: { label: 'Prefix' },
    quickEditFields: ['reference_type', 'start', 'pad_zeros'],
    fields: {
      reference_type: {
        optionLabels: {
          SalesInvoice: 'Sales Invoice',
          Quotation: 'Quotation',
          PurchaseInvoice: 'Purchase Invoice',
          PaymentEntry: 'Payment Entry',
          JournalEntry: 'Journal Entry',
          StockEntry: 'Stock Entry',
          PurchaseReceipt: 'Purchase Receipt',
          PricingRule: 'Pricing Rule',
        },
      },
    },
  };
}
