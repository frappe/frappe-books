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

export interface StockQuantity {
  item: string;
  batch: string | null;
  quantity: number;
}
