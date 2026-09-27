import { Money } from 'pesa';

export type ItemQtyMap = {
  [item: string]: { availableQty: number; [batch: string]: number };
};

export type ItemSerialNumbers = { [item: string]: string };

export type ItemGroupMap = Record<string, string>;

export type DiscountType = 'percent' | 'amount';

export type ItemVisibility = 'Inventory Items' | 'Non-Inventory Items';

export type POSLayout = 'Classic' | 'Modern';

export const modalNames = [
  'Keyboard',
  'Payment',
  'ShiftClose',
  'LoyaltyProgram',
  'SavedInvoice',
  'CouponCode',
  'PriceList',
  'ItemEnquiry',
  'ReturnSalesInvoice',
  'BatchSelection',
] as const;

export type ModalName = typeof modalNames[number];

export interface POSItem {
  id?: number;
  image?: string;
  name: string;
  itemCode?: string;
  barcode?: string;
  rate: Money;
  item?: string;
  batch?: string;
  availableQty: number;
  unit: string;
  hasBatch: boolean;
  hasSerialNumber: boolean;
  itemGroup?: string;
}
