import { FiltersMap, ValidationMap } from 'fyo/model/types';
import { validateEmail } from 'fyo/model/validationFunction';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';

/**
 * Books Accounting Settings, served by Frappe. Its country is Frappe's
 * System Settings country; the DocType shows it read only.
 */
export class AccountingSettings extends FrappeDoc {
  static override doctype = 'Books Accounting Settings';
  // These accounts are picked, not created, from the settings.
  static override presentation = {
    label: 'Accounting Settings',
    fields: withoutCreate([
      'write_off_account',
      'round_off_account',
      'discount_account',
    ]),
  };

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

  static filters: FiltersMap = {
    write_off_account: () => [
      ['is_group', '=', 0],
      ['root_type', '=', 'Expense'],
    ],
    round_off_account: () => [
      ['is_group', '=', 0],
      ['root_type', '=', 'Expense'],
    ],
    discount_account: () => [
      ['is_group', '=', 0],
      ['root_type', '=', 'Income'],
    ],
  };

  // The server checks it too; mirrored to show the message at the field.
  validations: ValidationMap = {
    email: validateEmail,
  };
}
