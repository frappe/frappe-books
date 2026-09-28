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
  fieldtype: FieldType;
  align?: 'left' | 'right' | 'center';
  width?: number;
}

export type Periodicity = 'Monthly' | 'Quarterly' | 'Half Yearly' | 'Yearly';

export type BasedOn = 'Fiscal Year' | 'Until Date';
