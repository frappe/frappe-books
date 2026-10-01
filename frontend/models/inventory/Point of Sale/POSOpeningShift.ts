import { ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';

/** A row of cash counted by denomination. */
export type CashCount = FrappeDoc & { denomination?: Money; count?: number };

/** A payment method's amount in a shift. */
export type ShiftAmount = FrappeDoc & {
  payment_method?: string;
  amount?: Money;
};

/** A Books Opening Cash row. */
export class OpeningCash extends FrappeDoc {
  static override presentation = { label: 'Opening Cash In Denominations' };
}

/** A Books Opening Amounts row. */
export class OpeningAmounts extends FrappeDoc {
  static override presentation = { label: 'Opening Amount' };
}

/** Books Pos Opening Shift, served by Frappe; its preview fills the opening cash amount. */
export class POSOpeningShift extends FrappeDoc {
  static override doctype = 'Books Pos Opening Shift';
  static override presentation = {
    label: 'POS Opening Shift',
    fileFields: ['name', 'opening_date', 'opening_cash', 'opening_amounts'],
  };
  static override rowModels = {
    opening_cash: OpeningCash,
    opening_amounts: OpeningAmounts,
  };
  static override previewMethod = 'preview';

  declare opening_date?: Date;
  declare opening_cash?: CashCount[];
  declare opening_amounts?: ShiftAmount[];

  /** The cash the counted denominations add up to. */
  get openingCashAmount(): Money {
    return getCashTotal(this.fyo.pesa(0), this.opening_cash);
  }

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'opening_date'] };
  }
}

export function getCashTotal(zero: Money, rows: CashCount[] = []): Money {
  return rows.reduce(
    (total, row) => total.add((row.denomination ?? zero).mul(row.count ?? 0)),
    zero
  );
}
