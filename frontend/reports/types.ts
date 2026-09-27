import { DateTime } from 'luxon';
import { AccountRootType } from 'models/baseModels/Account/types';
import { BaseField, FieldType, RawValue } from 'schemas/types';

export type ExportExtension = 'csv' | 'json';

export interface ReportCell {
  bold?: boolean;
  italics?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: number;
  value: string;
  rawValue: RawValue | undefined | Date;
  indent?: number;
  color?: 'red' | 'green';
}

export interface ReportRow {
  cells: ReportCell[];
  level?: number;
  isGroup?: boolean;
  isEmpty?: boolean;
  folded?: boolean;
  foldedBelow?: boolean;
}
export type ReportData = ReportRow[];
export interface ColumnField extends Omit<BaseField, 'fieldtype'> {
  // Distinguishes repeated fields, such as balances for different periods.
  key?: string;
  fieldtype: FieldType;
  align?: 'left' | 'right' | 'center';
  width?: number;
}

export type Periodicity = 'Monthly' | 'Quarterly' | 'Half Yearly' | 'Yearly';

export interface LedgerRow {
  type: 'entry' | 'opening' | 'total' | 'closing' | 'blank';
  index?: number;
  account?: string | null;
  date?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  party?: string | null;
  referenceType?: string;
  referenceName?: string;
  reverted?: boolean;
}

export type DateRange = { fromDate: DateTime; toDate: DateTime };
export type BasedOn = 'Fiscal Year' | 'Until Date';

export interface ReportAccount {
  name: string;
  level: number;
  isGroup: boolean;
  values: number[];
}

export interface AccountSection {
  rootType: AccountRootType;
  accounts: ReportAccount[];
  total: number[];
}
