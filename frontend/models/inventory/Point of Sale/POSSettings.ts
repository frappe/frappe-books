import { FiltersMap, HiddenMap } from 'fyo/model/types';
import {
  AccountRootTypeEnum,
  AccountTypeEnum,
} from 'models/baseModels/Account/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Pos Settings, served by Frappe. */
export class POSSettings extends FrappeDoc {
  static override doctype = 'Books Pos Settings';
  static override presentation = { label: 'POS Settings' };

  declare inventory?: string;
  declare pos_profile?: string;
  declare cash_account?: string;
  declare write_off_account?: string;
  declare default_account?: string;
  declare pos_ui?: 'Classic' | 'Modern';
  declare weight_enabled_barcode?: boolean;
  declare check_digits?: number;
  declare item_code_digits?: number;
  declare item_weight_digits?: number;
  declare item_visibility?: string;
  declare can_change_rate?: boolean;
  declare can_edit_discount?: boolean;
  declare hide_unavailable_items?: boolean;
  declare ignore_pricing_rule?: boolean;

  // Accounts are still read through the bridge, so these use its field names.
  static filters: FiltersMap = {
    cash_account: () => ({
      rootType: AccountRootTypeEnum.Asset,
      accountType: AccountTypeEnum.Cash,
      isGroup: false,
    }),
    write_off_account: () => ({
      isGroup: false,
      rootType: AccountRootTypeEnum.Expense,
    }),
    default_account: () => ({
      isGroup: false,
      accountType: AccountTypeEnum.Receivable,
    }),
  };

  // Fields of features turned off in other settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    weight_enabled_barcode: () =>
      !this.fyo.singles.InventorySettings?.enableBarcodes,
    check_digits: () => !this.fyo.singles.InventorySettings?.enableBarcodes,
    item_code_digits: () => !this.fyo.singles.InventorySettings?.enableBarcodes,
    item_weight_digits: () =>
      !this.fyo.singles.InventorySettings?.enableBarcodes,
    item_visibility: () =>
      !this.fyo.singles.AccountingSettings?.enablePointOfSaleWithOutInventory,
  };
}
