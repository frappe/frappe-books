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
  isTotal?: boolean;
  folded?: boolean;
  foldedBelow?: boolean;
}
export type ReportData = ReportRow[];
export interface ColumnField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: FieldType;
  align?: 'left' | 'right' | 'center';
  width?: number;
  /** The schema whose records a Link column names. */
  target?: string;
}

export type Periodicity = 'Monthly' | 'Quarterly' | 'Half Yearly' | 'Yearly';

export type BasedOn = 'Fiscal Year' | 'Until Date';

/** A value column in a report's phone layout. */
export interface PhoneValueColumn {
  fieldname: string;
  /** Header label, when the column's own label is too long. */
  label?: string;
  /** Minimum width in pixels. */
  width?: number;
}

/** Account trees and tables: a label column and at most two value columns. */
export interface PhoneTreeLayout {
  type: 'tree';
  label: string;
  values?: PhoneValueColumn[];
  /** Show one of the other columns, picked in a Column sheet; a Total column first. */
  periods?: boolean;
  /** Group rows under this column's values and sum the value columns. */
  groupBy?: string;
  /** Subtitle of a group row, from its number of distinct labels. */
  describeGroup?: (count: number) => string;
  /** Icon of the rows inside a group. */
  icon?: string;
  /** Filters shown as chips even when they are empty. */
  chips?: string[];
  /** Scroll sideways instead of wrapping the labels. */
  scroll?: boolean;
}

/** Ledgers: entries grouped under their dates. */
export interface PhoneEntriesLayout {
  type: 'entries';
  date: string;
  title: string;
  /** Shown signed, or with Dr and Cr when `credit` is set. */
  amount: string;
  credit?: string;
  meta: string[];
  balance: string;
  chips?: string[];
}

export type PhoneLayout = PhoneTreeLayout | PhoneEntriesLayout;
