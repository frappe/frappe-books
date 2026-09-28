import { ModelNameEnum } from 'models/types';

export type ReferenceType =
  | ModelNameEnum.StockMovement
  | ModelNameEnum.Shipment
  | ModelNameEnum.PurchaseReceipt
  | 'All';

export type SerialNumberStatus = 'All' | 'In stock' | 'Out stock';
