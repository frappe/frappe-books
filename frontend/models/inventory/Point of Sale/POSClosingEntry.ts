import { ChangeArg, ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { isAccessoryMode } from 'src/frappe/mode';
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

  /** ERPNext's Desk works out the difference as the counted amount changes; Books' server does in its preview. */
  override async change(arg: ChangeArg) {
    if (isAccessoryMode() && arg.changed === 'closing_amount') {
      const zero = this.fyo.pesa(0);
      this.difference = (this.closing_amount ?? zero).sub(
        this.expected_amount ?? zero
      );
    }

    await super.change(arg);
  }
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
  // Closing a shift submits its entry.
  static override submitsOnInsert = true;

  declare period_end_date?: Date;
  declare closing_cash?: CashCount[];
  declare payment_reconciliation?: ClosingAmount[];
  declare pos_opening_entry?: string;

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'period_end_date'] };
  }
}
