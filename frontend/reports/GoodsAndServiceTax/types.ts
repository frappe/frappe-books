export enum TransferTypeEnum {
  'B2B' = 'B2B',
  'B2CL' = 'B2CL',
  'B2CS' = 'B2CS',
  'NR' = 'NR',
}

export type TransferType = keyof typeof TransferTypeEnum;
export type GSTRType = 'GSTR-1' | 'GSTR-2';
export interface GSTRRow {
  gstin: string;
  party: string;
  invoice_no: string;
  invoice_date: string;
  rate: number;
  reverse_charge: 'Y' | 'N';
  in_state: boolean;
  place: string;
  invoice_value: number;
  taxable_value: number;
  igst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
}
