export enum MovementTypeEnum {
  'MaterialIssue' = 'MaterialIssue',
  'MaterialReceipt' = 'MaterialReceipt',
  'MaterialTransfer' = 'MaterialTransfer',
  'Manufacture' = 'Manufacture',
}

export type MovementType =
  | 'MaterialIssue'
  | 'MaterialReceipt'
  | 'MaterialTransfer'
  | 'Manufacture';

export type SerialNumberStatus =
  | 'Inactive'
  | 'Active'
  | 'Delivered';

export interface ReturnDocItem {
  quantity: number;
  batches?: Record<string, { quantity: number, serialNumbers?: string[] }> | undefined;
  serialNumbers?: string[] | undefined;
}

export interface StockQuantity {
  item: string;
  batch: string | null;
  quantity: number;
}
