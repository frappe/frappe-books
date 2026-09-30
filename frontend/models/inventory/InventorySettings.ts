import { FiltersMap } from 'fyo/model/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { FrappeDoc } from 'src/frappe/document';

/** Books Inventory Settings, served by Frappe. */
export class InventorySettings extends FrappeDoc {
  static override doctype = 'Books Inventory Settings';
  // These accounts are picked, not created, from the settings.
  static override presentation = {
    label: 'Inventory Settings',
    fields: {
      stock_in_hand: { create: false },
      stock_received_but_not_billed: { create: false },
      cost_of_goods_sold: { create: false },
    },
  };

  declare default_location?: string;
  declare stock_in_hand?: string;
  declare stock_received_but_not_billed?: string;
  declare cost_of_goods_sold?: string;
  declare enable_barcodes?: boolean;
  declare enable_batches?: boolean;
  declare enable_serial_number?: boolean;
  declare enable_uom_conversions?: boolean;
  declare enable_point_of_sale?: boolean;

  static filters: FiltersMap = {
    stock_in_hand: () => ({
      is_group: false,
      account_type: AccountTypeEnum.Stock,
    }),
    stock_received_but_not_billed: () => ({
      is_group: false,
      account_type: AccountTypeEnum['Stock Received But Not Billed'],
    }),
    cost_of_goods_sold: () => ({
      is_group: false,
      account_type: AccountTypeEnum['Cost of Goods Sold'],
    }),
  };
}
