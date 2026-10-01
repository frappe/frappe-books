import { ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { CashCount } from './POSOpeningShift';

/** A payment method's counted amount against what the shift expects. */
export type ClosingAmount = FrappeDoc & {
  payment_method?: string;
  opening_amount?: Money;
  closing_amount?: Money;
  expected_amount?: Money;
  difference_amount?: Money;
};

/** A Books Closing Cash row. */
export class ClosingCash extends FrappeDoc {
  static override presentation = { label: 'Closing Cash In Denominations' };
}

/** A Books Closing Amounts row. */
export class ClosingAmounts extends FrappeDoc {
  static override presentation = { label: 'Closing Amount' };
}

/** Books Pos Closing Shift, served by Frappe; its preview fills the expected, counted cash and difference amounts. */
export class POSClosingShift extends FrappeDoc {
  static override doctype = 'Books Pos Closing Shift';
  static override presentation = {
    label: 'POS Closing Shift',
    fields: withoutCreate(['opening_shift']),
    fileFields: [
      'name',
      'closing_date',
      'closing_cash',
      'closing_amounts',
      'opening_shift',
    ],
  };
  static override rowModels = {
    closing_cash: ClosingCash,
    closing_amounts: ClosingAmounts,
  };
  static override previewMethod = 'preview';

  declare closing_date?: Date;
  declare closing_cash?: CashCount[];
  declare closing_amounts?: ClosingAmount[];
  declare opening_shift?: string;

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'closing_date'] };
  }
}
