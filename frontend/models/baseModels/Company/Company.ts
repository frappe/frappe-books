import { FiltersMap, HiddenMap, ValidationMap } from 'fyo/model/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import type { Filter } from 'src/frappe/api';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { validateEmail } from 'src/frappe/validation';

const ACCOUNT_FIELDS = [
  'write_off_account',
  'round_off_account',
  'default_discount_account',
  'default_inventory_account',
  'stock_received_but_not_billed',
  'default_expense_account',
  'stock_adjustment_account',
];
const INVENTORY_FIELDS = [
  'default_warehouse',
  'default_inventory_account',
  'stock_received_but_not_billed',
  'default_expense_account',
  'stock_adjustment_account',
];

/**
 * The one Books Company, served by Frappe; Settings edits it. Its country and
 * currency are Frappe's System Settings; the DocType shows them read only.
 */
export class Company extends FrappeDoc {
  static override doctype = 'Books Company';
  // These accounts are picked, not created, from the settings.
  static override presentation = {
    label: 'Company',
    fields: withoutCreate(ACCOUNT_FIELDS),
  };

  declare company_name?: string;
  declare abbr?: string;
  declare country?: string;
  declare default_currency?: string;
  declare email?: string;
  declare tax_id?: string;
  declare write_off_account?: string;
  declare round_off_account?: string;
  declare default_discount_account?: string;
  declare default_warehouse?: string;
  declare default_inventory_account?: string;
  declare stock_received_but_not_billed?: string;
  declare default_expense_account?: string;
  declare stock_adjustment_account?: string;

  static filters: FiltersMap = {
    write_off_account: () => ledgersOfRootType('Expense'),
    round_off_account: () => ledgersOfRootType('Expense'),
    default_discount_account: () => ledgersOfRootType('Income'),
    default_inventory_account: () => ledgersOfType(AccountTypeEnum.Stock),
    stock_received_but_not_billed: () =>
      ledgersOfType(AccountTypeEnum['Stock Received But Not Billed']),
    default_expense_account: () =>
      ledgersOfType(AccountTypeEnum['Cost of Goods Sold']),
    stock_adjustment_account: () =>
      ledgersOfType(AccountTypeEnum['Stock Adjustment']),
  };

  hidden: HiddenMap = {
    default_discount_account: () =>
      !this.fyo.singles.AccountingSettings?.enable_discounts_and_margin,
    ...Object.fromEntries(
      INVENTORY_FIELDS.map((fieldname) => [
        fieldname,
        () => !this.fyo.singles.AccountingSettings?.enable_inventory,
      ])
    ),
  };

  // The server checks it too; mirrored to show the message at the field.
  validations: ValidationMap = {
    email: validateEmail,
  };
}

function ledgersOfRootType(rootType: string): Filter[] {
  return [
    ['is_group', '=', 0],
    ['root_type', '=', rootType],
  ];
}

function ledgersOfType(accountType: string): Filter[] {
  return [
    ['is_group', '=', 0],
    ['account_type', '=', accountType],
  ];
}
