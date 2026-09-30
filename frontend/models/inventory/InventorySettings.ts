import { Doc } from 'fyo/model/doc';
import { FiltersMap, ReadOnlyMap } from 'fyo/model/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';

export class InventorySettings extends Doc {
  defaultLocation?: string;
  stockInHand?: string;
  stockReceivedButNotBilled?: string;
  costOfGoodsSold?: string;
  enableBarcodes?: boolean;
  enableBatches?: boolean;
  enableSerialNumber?: boolean;
  enableUomConversions?: boolean;
  enablePointOfSale?: boolean;

  static filters: FiltersMap = {
    stockInHand: () => ({
      is_group: false,
      account_type: AccountTypeEnum.Stock,
    }),
    stockReceivedButNotBilled: () => ({
      is_group: false,
      account_type: AccountTypeEnum['Stock Received But Not Billed'],
    }),
    costOfGoodsSold: () => ({
      is_group: false,
      account_type: AccountTypeEnum['Cost of Goods Sold'],
    }),
  };

  readOnly: ReadOnlyMap = {
    enableBarcodes: () => {
      return !!this.enableBarcodes;
    },
    enableBatches: () => {
      return !!this.enableBatches;
    },
    enableSerialNumber: () => {
      return !!this.enableSerialNumber;
    },
    enableUomConversions: () => {
      return !!this.enableUomConversions;
    },
  };
}
