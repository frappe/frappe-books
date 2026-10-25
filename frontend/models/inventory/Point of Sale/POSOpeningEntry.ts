import { ListViewSettings } from 'fyo/model/types';
import type { Money } from 'pesa';
import type { Field } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { isAccessoryMode } from 'src/frappe/mode';

/** A row of cash counted by denomination. */
export type CashCount = FrappeDoc & { denomination?: Money; count?: number };

/** What the cash counters show and set of a counted row: a saved row, or a count only its total is saved of. */
export type CashCountRow = Pick<CashCount, 'idx' | 'denomination' | 'count'> & {
  set(fieldname: 'count', count: number): unknown;
};

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
    // ERPNext's entry opens a POS Profile's shift; the profile lists its modes.
    accessoryPlacements: [
      { fieldname: 'pos_profile', before: 'period_start_date' },
      { fieldname: 'user', before: 'balance_details' },
    ],
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
  // Opening a shift submits its entry.
  static override submitsOnInsert = true;

  declare period_start_date?: Date;
  declare pos_profile?: string;
  declare opening_cash?: CashCount[];
  declare balance_details?: OpeningBalance[];

  /** Accessory mode: the modes of payment come from the POS Profile, so their table says what is missing. */
  override getFormFields(fields: Field[]): Field[] {
    if (!isAccessoryMode()) {
      return fields;
    }

    const emptyMessage = this.pos_profile
      ? this.fyo.t`This POS Profile has no modes of payment`
      : this.fyo.t`Select a POS Profile to load its modes of payment`;
    return fields.map((field) =>
      field.fieldname === 'balance_details' ? { ...field, emptyMessage } : field
    );
  }

  /** The cash the counted denominations add up to. */
  get openingCashAmount(): Money {
    return getCashTotal(this.fyo.pesa(0), this.opening_cash);
  }

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'period_start_date'] };
  }
}

export function getCashTotal(zero: Money, rows: CashCountRow[] = []): Money {
  return rows.reduce(
    (total, row) => total.add((row.denomination ?? zero).mul(row.count ?? 0)),
    zero
  );
}
