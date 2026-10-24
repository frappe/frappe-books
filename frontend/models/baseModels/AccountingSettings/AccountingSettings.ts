import { FrappeDoc } from 'src/frappe/document';

/**
 * Books Accounting Settings, served by Frappe. Its country is Frappe's
 * System Settings country; the DocType shows it read only.
 */
export class AccountingSettings extends FrappeDoc {
  static override doctype = 'Books Accounting Settings';
  static override presentation = { label: 'Accounting Settings' };

  declare fullname?: string;
  declare bank_name?: string;
  declare country?: string;
  declare gstin?: string;
  declare year_start_date?: Date;
  declare year_end_date?: Date;
  declare setup_complete?: boolean;
  declare enable_discounts_and_margin?: boolean;
  declare enable_inventory?: boolean;
  declare enable_price_list?: boolean;
  declare enable_invoice_returns?: boolean;
  declare enable_form_customization?: boolean;
  declare enable_lead?: boolean;
  declare enable_pricing_rule?: boolean;
  declare enable_item_enquiry?: boolean;
  declare enable_loyalty_point_program?: boolean;
  declare enable_coupon_code?: boolean;
  declare enable_item_group?: boolean;
  declare enable_point_of_sale_with_out_inventory?: boolean;
  declare enable_partial_payment?: boolean;
}
