import { FiltersMap, HiddenMap } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { call } from 'src/web/api';
import { PartyRoleEnum } from '../Party/types';

const SET_PRINT_FORMATS =
  'frappe_books.frappe_books.doctype.books_defaults.books_defaults.set_print_formats';

// Fields that show the default print format each doctype keeps, by fieldname.
const DOCTYPE_PRINT_FORMATS: Record<string, string> = {
  sales_quote_print_template: 'Books Sales Quote',
  sales_invoice_print_template: 'Books Sales Invoice',
  purchase_invoice_print_template: 'Books Purchase Invoice',
  journal_entry_print_template: 'Books Journal Entry',
  payment_print_template: 'Books Payment',
  shipment_print_template: 'Books Shipment',
  purchase_receipt_print_template: 'Books Purchase Receipt',
  stock_movement_print_template: 'Books Stock Movement',
};

/** Print Formats of `doctype`, which a print template picker offers. */
function printFormatFilter(doctype: string) {
  return () => ({ doc_type: doctype });
}

/** Books Defaults, served by Frappe: what new documents start with. */
export class Defaults extends FrappeDoc {
  static override doctype = 'Books Defaults';
  // Print templates are picked, not created, from the settings.
  static override presentation = {
    label: 'Defaults',
    fields: withoutCreate([
      ...Object.keys(DOCTYPE_PRINT_FORMATS),
      'pos_print_template',
    ]),
  };

  declare sales_payment_account?: string;
  declare purchase_payment_account?: string;
  declare shipment_location?: string;
  declare purchase_receipt_location?: string;
  declare sales_invoice_terms?: string;
  declare purchase_invoice_terms?: string;
  declare shipment_terms?: string;
  declare purchase_receipt_terms?: string;
  declare pos_print_template?: string;
  declare pos_customer?: string;
  declare pos_cash_denominations?: (FrappeDoc & { denomination?: Money })[];

  static commonFilters: FiltersMap = {
    sales_payment_account: () => ({
      is_group: false,
      account_type: ['in', ['Cash', 'Bank']],
    }),
    purchase_payment_account: () => ({
      is_group: false,
      account_type: ['in', ['Cash', 'Bank']],
    }),
    sales_quote_number_series: () => ({
      reference_type: ModelNameEnum.SalesQuote,
    }),
    sales_invoice_number_series: () => ({
      reference_type: ModelNameEnum.SalesInvoice,
    }),
    purchase_invoice_number_series: () => ({
      reference_type: ModelNameEnum.PurchaseInvoice,
    }),
    journal_entry_number_series: () => ({
      reference_type: ModelNameEnum.JournalEntry,
    }),
    payment_number_series: () => ({
      reference_type: ModelNameEnum.Payment,
    }),
    stock_movement_number_series: () => ({
      reference_type: ModelNameEnum.StockMovement,
    }),
    shipment_number_series: () => ({
      reference_type: ModelNameEnum.Shipment,
    }),
    purchase_receipt_number_series: () => ({
      reference_type: ModelNameEnum.PurchaseReceipt,
    }),
    ...Object.fromEntries(
      Object.entries(DOCTYPE_PRINT_FORMATS).map(([fieldname, doctype]) => [
        fieldname,
        printFormatFilter(doctype),
      ])
    ),
    pos_print_template: printFormatFilter('Books Sales Invoice'),
    pos_customer: () => ({ role: PartyRoleEnum.Customer }),
  };

  static filters: FiltersMap = this.commonFilters;
  static createFilters: FiltersMap = this.commonFilters;

  getInventoryHidden() {
    return () => !this.fyo.singles.AccountingSettings?.enable_inventory;
  }

  getPointOfSaleHidden() {
    return () => !this.fyo.singles.InventorySettings?.enable_point_of_sale;
  }

  hidden: HiddenMap = {
    stock_movement_number_series: this.getInventoryHidden(),
    shipment_number_series: this.getInventoryHidden(),
    purchase_receipt_number_series: this.getInventoryHidden(),
    shipment_terms: this.getInventoryHidden(),
    purchase_receipt_terms: this.getInventoryHidden(),
    shipment_print_template: this.getInventoryHidden(),
    purchase_receipt_print_template: this.getInventoryHidden(),
    stock_movement_print_template: this.getInventoryHidden(),
    pos_cash_denominations: this.getPointOfSaleHidden(),
    pos_customer: this.getPointOfSaleHidden(),
    save_button_colour: this.getPointOfSaleHidden(),
    cancel_button_colour: this.getPointOfSaleHidden(),
    submit_button_colour: this.getPointOfSaleHidden(),
    held_button_colour: this.getPointOfSaleHidden(),
    return_button_colour: this.getPointOfSaleHidden(),
    pay_button_colour: this.getPointOfSaleHidden(),
    pay_and_print_button_colour: this.getPointOfSaleHidden(),
  };

  /** The print formats are the doctypes'; a save of the settings sets them first. */
  override async beforeSync() {
    await super.beforeSync();
    const printFormats = Object.keys(DOCTYPE_PRINT_FORMATS).map((fieldname) => [
      fieldname,
      this[fieldname] || null,
    ]);
    await call(SET_PRINT_FORMATS, {
      print_formats: Object.fromEntries(printFormats),
    });
  }

  override async afterSync() {
    await this.fyo.loadDefaultNumberSeries();
  }
}
