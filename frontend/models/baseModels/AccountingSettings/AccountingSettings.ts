import { FiltersMap, ValidationMap } from 'fyo/model/types';
import { validateEmail } from 'fyo/model/validationFunction';
import { FrappeDoc } from 'src/frappe/document';

/**
 * Books Accounting Settings, served by Frappe. Its country is Frappe's
 * System Settings country; the DocType shows it read only.
 */
export class AccountingSettings extends FrappeDoc {
  static override doctype = 'Books Accounting Settings';
  static override presentation = { label: 'Accounting Settings' };

  declare fullname?: string;
  declare company_name?: string;
  declare bank_name?: string;
  declare country?: string;
  declare email?: string;
  declare gstin?: string;
  declare tax_id?: string;
  declare write_off_account?: string;
  declare round_off_account?: string;
  declare discount_account?: string;
  declare fiscal_year_start?: Date;
  declare fiscal_year_end?: Date;
  declare setup_complete?: boolean;
  declare enable_discounting?: boolean;
  declare enable_inventory?: boolean;
  declare enable_price_list?: boolean;
  declare enable_invoice_returns?: boolean;
  declare enable_form_customization?: boolean;
  declare enable_lead?: boolean;
  declare enable_pricing_rule?: boolean;
  declare enable_item_enquiry?: boolean;
  declare enable_loyalty_program?: boolean;
  declare enable_coupon_code?: boolean;
  declare enableitem_group?: boolean;
  declare enable_point_of_sale_with_out_inventory?: boolean;
  declare enable_partial_payment?: boolean;

  // Accounts are still read through the bridge, so these use its field names.
  static filters: FiltersMap = {
    write_off_account: () => ({ isGroup: false, rootType: 'Expense' }),
    round_off_account: () => ({ isGroup: false, rootType: 'Expense' }),
    discount_account: () => ({ isGroup: false, rootType: 'Income' }),
  };

  // The server checks it too; mirrored to show the message at the field.
  validations: ValidationMap = {
    email: validateEmail,
  };
}
