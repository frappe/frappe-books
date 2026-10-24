import { ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { CashCount } from './POSOpeningEntry';

/** A mode of payment's counted amount against what the shift expects. */
export type ClosingAmount = FrappeDoc & {
  mode_of_payment?: string;
  opening_amount?: Money;
  closing_amount?: Money;
  expected_amount?: Money;
  difference?: Money;
};

/** A Books Closing Cash row. */
export class ClosingCash extends FrappeDoc {
  static override presentation = { label: 'Closing Cash In Denominations' };
}

/** A Books POS Closing Entry Detail row. */
export class POSClosingEntryDetail extends FrappeDoc {
  static override presentation = { label: 'Payment Reconciliation' };
}

/** Books POS Closing Entry, served by Frappe; its preview fills the expected, counted cash and difference amounts. */
export class POSClosingEntry extends FrappeDoc {
  static override doctype = 'Books POS Closing Entry';
  static override presentation = {
    label: 'POS Closing Entry',
    fields: withoutCreate(['pos_opening_entry']),
    fileFields: [
      'name',
      'period_end_date',
      'closing_cash',
      'payment_reconciliation',
      'pos_opening_entry',
    ],
  };
  static override rowModels = {
    closing_cash: ClosingCash,
    payment_reconciliation: POSClosingEntryDetail,
  };
  static override previewMethod = 'preview';

  declare period_end_date?: Date;
  declare closing_cash?: CashCount[];
  declare payment_reconciliation?: ClosingAmount[];
  declare pos_opening_entry?: string;

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'period_end_date'] };
  }
}
