import { ModeOfPaymentType } from 'models/types';
import { Money } from 'pesa';

export type ItemQtyMap = {
  [item: string]: { availableQty: number; [batch: string]: number };
};

export type ItemGroupMap = Record<string, string>;

export type DiscountType = 'percent' | 'amount';

export type ItemVisibility =
  'Inventory Items' | 'Non-Inventory Items' | 'All Items';

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

export type ModalName = (typeof modalNames)[number];

/** Cart item errors share one toast, so repeated taps do not stack them. */
export const POS_ITEM_TOAST_ID = 'pos-item-error';

export interface POSItem {
  id?: number;
  image?: string;
  name: string;
  /** The name the POS shows: an ERPNext item's item name, else its code. */
  itemName: string;
  /** The item's barcodes, which a scan matches. */
  barcodes: string[];
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

/** The icon for each kind of payment method. */
export const paymentMethodIcons: Record<ModeOfPaymentType, string> = {
  Cash: 'lucide-banknote',
  Bank: 'lucide-landmark',
  General: 'lucide-wallet',
  Phone: 'lucide-smartphone',
};

/** A payment method the cashier picks, by Books Mode of Payment fieldnames. */
export type PaymentMethodOption = {
  name: string;
  type?: ModeOfPaymentType;
  requires_clearance_date?: boolean;
};
