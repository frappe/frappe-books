import { FiltersMap, HiddenMap } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { PartyRoleEnum } from '../Party/types';

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
      'sales_quote_print_template',
      'sales_invoice_print_template',
      'purchase_invoice_print_template',
      'journal_entry_print_template',
      'payment_print_template',
      'shipment_print_template',
      'purchase_receipt_print_template',
      'stock_movement_print_template',
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
    sales_quote_print_template: printFormatFilter('Books Sales Quote'),
    sales_invoice_print_template: printFormatFilter('Books Sales Invoice'),
    pos_print_template: printFormatFilter('Books Sales Invoice'),
    purchase_invoice_print_template: printFormatFilter(
      'Books Purchase Invoice'
    ),
    journal_entry_print_template: printFormatFilter('Books Journal Entry'),
    payment_print_template: printFormatFilter('Books Payment'),
    shipment_print_template: printFormatFilter('Books Shipment'),
    purchase_receipt_print_template: printFormatFilter(
      'Books Purchase Receipt'
    ),
    stock_movement_print_template: printFormatFilter('Books Stock Movement'),
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

  override async afterSync() {
    await this.fyo.loadDefaultNumberSeries();
  }
}
