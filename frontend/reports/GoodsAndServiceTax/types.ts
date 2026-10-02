export enum TransferTypeEnum {
  'B2B' = 'B2B',
  'B2CL' = 'B2CL',
  'B2CS' = 'B2CS',
  'CDNR' = 'CDNR',
  'CDNUR' = 'CDNUR',
  'NR' = 'NR',
}

export type TransferType = keyof typeof TransferTypeEnum;
export type GSTRType = 'GSTR-1' | 'GSTR-2';
