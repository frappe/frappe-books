import { FiltersMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn } from 'models/helpers';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
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
  static override presentation = {
    label: 'Payment Reconciliation',
    fields: {
      // The server sets it, but stores it, so lists filter by it.
      period_end_date: { filter: true },
      difference: { negativeInRed: true },
    },
    // Phones count each mode in a block: what is expected beside what was counted.
    mobileBlock: {
      title: 'mode_of_payment',
      fields: ['expected_amount', 'closing_amount'] as [string, string],
      result: 'difference',
    },
  };

  declare closing_amount?: Money;
  declare expected_amount?: Money;
  declare difference?: Money;
}

/** Books POS Closing Entry, served by Frappe; its preview fills the expected, counted cash and difference amounts. */
export class POSClosingEntry extends FrappeDoc {
  static override doctype = 'Books POS Closing Entry';
  static override presentation = {
    label: 'POS Closing Entry',
    // The shifts are grouped by cashier, as their names are random.
    fields: { pos_opening_entry: { groupBy: 'owner', create: false } },
    fileFields: [
      'name',
      'period_end_date',
      'closing_cash',
      'payment_reconciliation',
      'pos_opening_entry',
    ],
  };
  // A manager may close any open shift; a cashier reads only their own.
  static filters: FiltersMap = {
    pos_opening_entry: () => [['status', '=', 'Open']],
  };
  static override rowModels = {
    closing_cash: ClosingCash,
    payment_reconciliation: POSClosingEntryDetail,
  };
  static override previewMethod = 'preview';
  // Closing a shift submits its entry.
  static override submitsOnInsert = true;

  declare period_end_date?: Date;
  declare closing_cash?: CashCount[];
  declare payment_reconciliation?: ClosingAmount[];
  declare pos_opening_entry?: string;

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'cashier',
        'pos_profile',
        'period_end_date',
      ],
    };
  }
}
