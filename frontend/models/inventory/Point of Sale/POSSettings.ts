import { Doc } from 'fyo/model/doc';
import { FiltersMap, HiddenMap } from 'fyo/model/types';
import {
  AccountRootTypeEnum,
  AccountTypeEnum,
} from 'models/baseModels/Account/types';

export class POSSettings extends Doc {
  inventory?: string;
  cashAccount?: string;
  writeOffAccount?: string;
  weightEnabledBarcode?: boolean;
  checkDigits?: number;
  itemCodeDigits?: number;
  itemWeightDigits?: number;
  defaultAccount?: string;
  itemVisibility?: string;
  posUI?: 'Classic' | 'Modern';
  canChangeRate?: boolean;
  canEditDiscount?: boolean;
  ignorePricingRule?: boolean;

  static filters: FiltersMap = {
    cashAccount: () => ({
      root_type: AccountRootTypeEnum.Asset,
      account_type: AccountTypeEnum.Cash,
      is_group: false,
    }),
    writeOffAccount: () => ({
      is_group: false,
      root_type: AccountRootTypeEnum.Expense,
    }),
    defaultAccount: () => ({
      is_group: false,
      account_type: AccountTypeEnum.Receivable,
    }),
  };

  hidden: HiddenMap = {
    weightEnabledBarcode: () =>
      !this.fyo.singles.InventorySettings?.enableBarcodes,
    checkDigits: () =>
      !this.fyo.singles.InventorySettings?.enableBarcodes ||
      !this.weightEnabledBarcode,
    itemCodeDigits: () =>
      !this.fyo.singles.InventorySettings?.enableBarcodes ||
      !this.weightEnabledBarcode,
    itemWeightDigits: () =>
      !this.fyo.singles.InventorySettings?.enableBarcodes ||
      !this.weightEnabledBarcode,
    itemVisibility: () =>
      !this.fyo.singles.AccountingSettings?.enablePointOfSaleWithOutInventory,
  };
}
