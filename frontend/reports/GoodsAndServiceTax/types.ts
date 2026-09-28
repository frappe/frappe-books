export enum TransferTypeEnum {
  'B2B' = 'B2B',
  'B2CL' = 'B2CL',
  'B2CS' = 'B2CS',
  'NR' = 'NR',
}

export type TransferType = keyof typeof TransferTypeEnum;
export type GSTRType = 'GSTR-1' | 'GSTR-2';
