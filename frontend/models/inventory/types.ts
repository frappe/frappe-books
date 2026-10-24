export enum MovementTypeEnum {
  'MaterialIssue' = 'MaterialIssue',
  'MaterialReceipt' = 'MaterialReceipt',
  'MaterialTransfer' = 'MaterialTransfer',
  'Manufacture' = 'Manufacture',
}

export type SerialNoStatus =
  | 'Active'
  | 'Inactive'
  | 'Consumed'
  | 'Delivered'
  | 'Expired';
