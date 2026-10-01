import { FrappeDoc } from 'src/frappe/document';

/** Books Number Series, served by Frappe; its counter is Frappe's Series. */
export class NumberSeries extends FrappeDoc {
  static override doctype = 'Books Number Series';
  static override presentation = {
    label: 'Number Series',
    nameField: { label: 'Prefix' },
    quickEditFields: ['reference_type', 'start', 'pad_zeros'],
    fields: {
      reference_type: {
        optionLabels: {
          SalesInvoice: 'Sales Invoice',
          SalesQuote: 'Sales Quote',
          PurchaseInvoice: 'Purchase Invoice',
          JournalEntry: 'Journal Entry',
          StockMovement: 'Stock Movement',
          PurchaseReceipt: 'Purchase Receipt',
          PricingRule: 'Pricing Rule',
        },
      },
    },
  };
}
