import { PaymentMethodType } from 'models/types';
import { Money } from 'pesa';

export type ItemQtyMap = {
  [item: string]: { availableQty: number; [batch: string]: number };
};

export type ItemGroupMap = Record<string, string>;

export type DiscountType = 'percent' | 'amount';

export type ItemVisibility =
  | 'Inventory Items'
  | 'Non-Inventory Items'
  | 'All Items';

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
  trackItem?: boolean;
  unit: string;
  hasBatch: boolean;
  hasSerialNumber: boolean;
  itemGroup?: string;
}

/** A payment method the cashier picks, by Books Payment Method fieldnames. */
export type PaymentMethodOption = {
  name: string;
  type?: PaymentMethodType;
  requires_clearance_date?: boolean;
};
