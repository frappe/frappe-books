import { ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';

/** A row of cash counted by denomination. */
export type CashCount = FrappeDoc & { denomination?: Money; count?: number };

/** A mode of payment's opening amount in a shift. */
export type OpeningBalance = FrappeDoc & {
  mode_of_payment?: string;
  opening_amount?: Money;
};

/** A Books Opening Cash row. */
export class OpeningCash extends FrappeDoc {
  static override presentation = { label: 'Opening Cash In Denominations' };
}

/** A Books POS Opening Entry Detail row. */
export class POSOpeningEntryDetail extends FrappeDoc {
  static override presentation = { label: 'Opening Balance Detail' };
}

/** Books POS Opening Entry, served by Frappe; its preview fills the start date and opening cash amount. */
export class POSOpeningEntry extends FrappeDoc {
  static override doctype = 'Books POS Opening Entry';
  static override presentation = {
    label: 'POS Opening Entry',
    fields: {
      balance_details: { emptyMessage: 'There are no modes of payment.' },
    },
    fileFields: [
      'name',
      'period_start_date',
      'opening_cash',
      'balance_details',
    ],
  };
  static override rowModels = {
    opening_cash: OpeningCash,
    balance_details: POSOpeningEntryDetail,
  };
  static override previewMethod = 'preview';

  declare period_start_date?: Date;
  declare opening_cash?: CashCount[];
  declare balance_details?: OpeningBalance[];

  /** The cash the counted denominations add up to. */
  get openingCashAmount(): Money {
    return getCashTotal(this.fyo.pesa(0), this.opening_cash);
  }

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'period_start_date'] };
  }
}

export function getCashTotal(zero: Money, rows: CashCount[] = []): Money {
  return rows.reduce(
    (total, row) => total.add((row.denomination ?? zero).mul(row.count ?? 0)),
    zero
  );
}
