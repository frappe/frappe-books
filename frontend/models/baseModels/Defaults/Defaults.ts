import { FiltersMap, HiddenMap } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { getDocType } from 'src/frappe/doctypes';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { call } from 'src/web/api';
import { BUTTON_COLOUR_FIELDS } from '../POSProfile/PosProfile';

const SET_PRINT_FORMATS =
  'frappe_books.frappe_books.doctype.books_defaults.books_defaults.set_print_formats';

// The pickers offer the Print Formats their DocFields' link_filters name.
const PRINT_TEMPLATE_FIELDS = [
  'quotation_print_template',
  'sales_invoice_print_template',
  'purchase_invoice_print_template',
  'journal_entry_print_template',
  'payment_print_template',
  'delivery_note_print_template',
  'purchase_receipt_print_template',
  'stock_entry_print_template',
  'pos_print_template',
];

/** A Books Default Cash Denominations row. */
export class DefaultCashDenominations extends FrappeDoc {
  static override presentation = { label: 'Default Cash Denominations' };
}

/** Books Defaults, served by Frappe: what new documents start with. */
export class Defaults extends FrappeDoc {
  static override doctype = 'Books Defaults';
  // Standalone only
  static override erpnextDoctype = null;
  // Print templates are picked, not created, from the settings.
  static override presentation = {
    label: 'Defaults',
    fields: {
      ...withoutCreate(PRINT_TEMPLATE_FIELDS),
      ...BUTTON_COLOUR_FIELDS,
    },
  };
  static override rowModels = {
    pos_cash_denominations: DefaultCashDenominations,
  };

  declare sales_payment_account?: string;
  declare purchase_payment_account?: string;
  declare delivery_note_location?: string;
  declare purchase_receipt_location?: string;
  declare sales_invoice_terms?: string;
  declare purchase_invoice_terms?: string;
  declare delivery_note_terms?: string;
  declare purchase_receipt_terms?: string;
  declare pos_print_template?: string;
  declare pos_customer?: string;
  declare pos_cash_denominations?: (FrappeDoc & { denomination?: Money })[];

  // The payment accounts and print templates filter by their link_filters.
  static commonFilters: FiltersMap = {
    quotation_number_series: () => [
      ['reference_type', '=', ModelNameEnum.Quotation],
    ],
    sales_invoice_number_series: () => [
      ['reference_type', '=', ModelNameEnum.SalesInvoice],
    ],
    purchase_invoice_number_series: () => [
      ['reference_type', '=', ModelNameEnum.PurchaseInvoice],
    ],
    journal_entry_number_series: () => [
      ['reference_type', '=', ModelNameEnum.JournalEntry],
    ],
    payment_number_series: () => [
      ['reference_type', '=', ModelNameEnum.PaymentEntry],
    ],
    stock_entry_number_series: () => [
      ['reference_type', '=', ModelNameEnum.StockEntry],
    ],
    delivery_note_number_series: () => [
      ['reference_type', '=', ModelNameEnum.DeliveryNote],
    ],
    purchase_receipt_number_series: () => [
      ['reference_type', '=', ModelNameEnum.PurchaseReceipt],
    ],
  };

  static filters: FiltersMap = this.commonFilters;
  static createFilters: FiltersMap = this.commonFilters;

  getInventoryHidden() {
    return () => !this.fyo.isFeatureOn('enable_inventory');
  }

  getPointOfSaleHidden() {
    return () => !this.fyo.isFeatureOn('enable_point_of_sale');
  }

  hidden: HiddenMap = {
    delivery_note_location: this.getInventoryHidden(),
    purchase_receipt_location: this.getInventoryHidden(),
    stock_entry_number_series: this.getInventoryHidden(),
    delivery_note_number_series: this.getInventoryHidden(),
    purchase_receipt_number_series: this.getInventoryHidden(),
    delivery_note_terms: this.getInventoryHidden(),
    purchase_receipt_terms: this.getInventoryHidden(),
    delivery_note_print_template: this.getInventoryHidden(),
    purchase_receipt_print_template: this.getInventoryHidden(),
    stock_entry_print_template: this.getInventoryHidden(),
    pos_print_template: this.getPointOfSaleHidden(),
    pos_cash_denominations: this.getPointOfSaleHidden(),
    pos_customer: this.getPointOfSaleHidden(),
    save_button_colour: this.getPointOfSaleHidden(),
    cancel_button_colour: this.getPointOfSaleHidden(),
    held_button_colour: this.getPointOfSaleHidden(),
    return_button_colour: this.getPointOfSaleHidden(),
    pay_button_colour: this.getPointOfSaleHidden(),
  };

  /** The virtual print format fields are the doctypes'; a save of the settings sets them first. */
  override async beforeSync() {
    await super.beforeSync();
    const printFormats = getDocType(this.schemaName)
      .meta.fields.filter(
        (df) => df.is_virtual && df.options === 'Print Format'
      )
      .map(({ fieldname }) => [fieldname, this[fieldname] || null]);
    await call(SET_PRINT_FORMATS, {
      print_formats: Object.fromEntries(printFormats),
    });
  }
}
