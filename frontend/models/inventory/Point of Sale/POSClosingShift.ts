import { ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { CashCount, getCashTotal } from './POSOpeningShift';

/** A payment method's counted amount against what the shift expects. */
export type ClosingAmount = FrappeDoc & {
  payment_method?: string;
  opening_amount?: Money;
  closing_amount?: Money;
  expected_amount?: Money;
  difference_amount?: Money;
};

/** Books Pos Closing Shift, served by Frappe; its preview fills the expected amounts. */
export class POSClosingShift extends FrappeDoc {
  static override doctype = 'Books Pos Closing Shift';
  static override presentation = {
    label: 'POS Closing Shift',
    fields: withoutCreate(['opening_shift']),
  };
  static override previewMethod = 'preview';

  declare closing_date?: Date;
  declare closing_cash?: CashCount[];
  declare closing_amounts?: ClosingAmount[];
  declare opening_shift?: string;

  /** The cash the counted denominations add up to. */
  get closingCashAmount(): Money {
    return getCashTotal(this.fyo.pesa(0), this.closing_cash);
  }

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'closing_date'] };
  }
}
