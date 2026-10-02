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

  static filters: FiltersMap = {
    cash_account: () => [
      ['root_type', '=', AccountRootTypeEnum.Asset],
      ['account_type', '=', AccountTypeEnum.Cash],
      ['is_group', '=', 0],
    ],
    write_off_account: () => [
      ['is_group', '=', 0],
      ['root_type', '=', AccountRootTypeEnum.Expense],
    ],
    default_account: () => [
      ['is_group', '=', 0],
      ['account_type', '=', AccountTypeEnum.Receivable],
    ],
  };

  // Fields of features turned off in other settings. The DocType's depends_on hides the rest.
  hidden: HiddenMap = {
    weight_enabled_barcode: () =>
      !this.fyo.singles.InventorySettings?.enable_barcodes,
    check_digits: () => !this.fyo.singles.InventorySettings?.enable_barcodes,
    item_code_digits: () =>
      !this.fyo.singles.InventorySettings?.enable_barcodes,
    item_weight_digits: () =>
      !this.fyo.singles.InventorySettings?.enable_barcodes,
  };
}
